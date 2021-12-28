// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/interfaces/draft-IERC2612.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/utils/Timers.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";

import "./FortaStakingUtils.sol";
import "./FortaStakingSubjectTypes.sol";
import "../BaseComponent.sol";
import "../../tools/Distributions.sol";
import "../../tools/FullMath.sol";

interface IRewardReceiver {
    function onRewardReceived(uint8 subjectType, uint256 subject, uint256 amount) external;
}

/**
 * @dev This is a generic staking contract for the Forta platform. It allows any account to deposit ERC20 tokens to
 * delegate their "power" by staking on behalf of a particular subject. The subject can be scanner, or any other actor
 * in the Forta ecosystem, who need to lock assets in order to contribute to the system.
 *
 * Stakers take risks with their funds, as bad action from a subject can lead to slashing of the funds. In the
 * meantime, stakers are elligible for rewards. Rewards distributed to a particular subject's stakers are distributed
 * following to each staker's share in the subject.
 *
 * Stakers can withdraw their funds, following a withdrawal delay. During the withdrawal delay, funds are no longer
 * counting toward the active stake of a subject, but are still slashable.
 *
 * The SLASHER_ROLE should be given to a future smart contract that will be in charge of resolving disputes.
 *
 * Stakers receive ERC1155 shares in exchange for their stake, making the active stake transferable. When a withdrawal
 * is initiated, similarly the ERC1155 tokens representing the (transferable) active shares are burned in exchange for
 * non-transferable ERC1155 tokens representing the inactive shares.
 *
 * ERC1155 shares representing active stake are transferable, and can be used in an AMM. Their value is however subject
 * to quick devaluation in case of slashing event for the corresponding subject. Thus, trading of such shares should be
 * be done very carefully.
 */
contract FortaStaking is BaseComponent, ERC1155SupplyUpgradeable {
    using Distributions for Distributions.Balances;
    using Distributions for Distributions.SignedBalances;
    using Timers        for Timers.Timestamp;

    IERC20 public stakedToken;

    // subject => active stake
    Distributions.Balances private _activeStake;
    // subject => inactive stake
    Distributions.Balances private _inactiveStake;
    

    // subject => staker => inactive stake timer
    mapping(uint256 => mapping(address => Timers.Timestamp)) private _lockingDelay;

    // subject => reward
    Distributions.Balances private _rewards;
    // subject => staker => released reward
    mapping(uint256 => Distributions.SignedBalances) private _released;

    // frozen tokens
    mapping(uint256 => bool) private _frozen;

    // withdrawal delay
    uint64 private _withdrawalDelay;

    // treasury for slashing
    address private _treasury;

    event StakeDeposited(uint8 indexed subjectType, uint256 indexed subject, address indexed account, uint256 amount);
    event WithdrawalInitiated(uint8 indexed subjectType, uint256 indexed subject, address indexed account, uint64 deadline);
    event WithdrawalExecuted(uint8 indexed subjectType, uint256 indexed subject, address indexed account);
    event Froze(uint8 indexed subjectType, uint256 indexed subject, address indexed by, bool isFrozen);
    event Slashed(uint8 indexed subjectType, uint256 indexed subject, address indexed by, uint256 value);
    event Rewarded(uint8 indexed subjectType, uint256 indexed subject, address indexed from, uint256 value);
    event Released(uint8 indexed subjectType, uint256 indexed subject, address indexed to, uint256 value);
    event DelaySet(uint256 newWithdrawalDelay);
    event TreasurySet(address newTreasury);

    modifier onlyValidSubjectType(uint8 subjectType) {
        require(
            subjectType == SCANNER_SUBJECT ||
            subjectType == AGENT_SUBJECT,
            "FortaStaking: invalid subjectType"
        );
        _;
    }

    modifier onlyValidSubject(uint256 subject) {
        require(
            subject > 0,
            "FortaStaking: subject cannot be 0"
        );
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    function initialize(
        address __manager,
        address __router,
        IERC20 __stakedToken,
        uint64 __withdrawalDelay,
        address __treasury
    ) public initializer {
        __AccessManaged_init(__manager);
        __Routed_init(__router);
        __UUPSUpgradeable_init();
        __ERC1155_init("");

        stakedToken = __stakedToken;
        _withdrawalDelay = __withdrawalDelay;
        _treasury = __treasury;
        emit DelaySet(__withdrawalDelay);
        emit TreasurySet(__treasury);
    }

    /**
     * @dev Get stake of a subject
     */
    function activeStakeFor(uint8 subjectType, uint256 subject) external view returns (uint256) {
        return _activeStake.balanceOf(FortaStakingUtils.subjectToActive(subjectType, subject));
    }

    /**
     * @dev Get total stake of all subjects
     */
    function totalActiveStake() public view returns (uint256) {
        return _activeStake.totalSupply();
    }

    /**
     * @dev Get stake inactive for withdrawal of a subject
     */
    function inactiveStakeFor(uint8 subjectType, uint256 subject) external view returns (uint256) {
        return _inactiveStake.balanceOf(FortaStakingUtils.subjectToInactive(subjectType, subject));
    }

    /**
     * @dev Get total stake inactive for withdrawal of all subjects
     */
    function totalInactiveStake() public view returns (uint256) {
        return _inactiveStake.totalSupply();
    }

    /**
     * @dev Get (active) shares of an account on a subject, corresponding to a fraction of the subject stake.
     * NOTE: This is equivalent to getting the ERC1155 balanceOf for keccak256(abi.encodePacked(subjectType, subject)),
     * shifted 9 bits, with the 9th bit set and uint8(subjectType) masked in
     */
    function sharesOf(uint8 subjectType, uint256 subject, address account) public view returns (uint256) {
        return balanceOf(account, FortaStakingUtils.subjectToActive(subjectType, subject));
    }

    /**
     * @dev Get the total (active) shares on a subject.
     *
     * NOTE: This is equivalent to getting the ERC1155 totalSupply for keccak256(abi.encodePacked(subjectType, subject)),
     * shifted 9 bits, with the 9th bit set and uint8(subjectType) masked in
     */
    function totalShares(uint8 subjectType, uint256 subject) external view returns (uint256) {
        return totalSupply(FortaStakingUtils.subjectToActive(subjectType, subject));
    }

    /**
     * @dev Get inactive shares of an account on a subject, corresponding to a fraction of the subject inactive stake.
     *
     * NOTE: This is equivalent to getting the ERC1155 balanceOf for keccak256(abi.encodePacked(subjectType, subject)),
     * shifted 9 bits, with the 9th bit unset and uint8(subjectType) masked in
     */
    function inactiveSharesOf(uint8 subjectType, uint256 subject, address account) external view returns (uint256) {
        return balanceOf(account, FortaStakingUtils.subjectToInactive(subjectType, subject));
    }

    /**
     * @dev Get the total inactive shares on a subject.
     *
     * NOTE: This is equivalent to getting the ERC1155 totalSupply for keccak256(abi.encodePacked(subjectType, subject)),
     * shifted 9 bits, with the 9th bit unset and uint8(subjectType) masked in
     */
    function totalInactiveShares(uint8 subjectType, uint256 subject) external view returns (uint256) {
        return totalSupply(FortaStakingUtils.subjectToInactive(subjectType, subject));
    }

    /**
     * @dev Is a subject frozen (stake of frozen subject cannot be withdrawn).
     */
    function isFrozen(uint8 subjectType, uint256 subject) public view returns (bool) {
        return _frozen[FortaStakingUtils.subjectToActive(subjectType, subject)];
    }

    /**
     * @dev Deposit `stakeValue` tokens for a given `subject`, and mint the corresponding shares.
     * NOTE: Subject type is necessary because we can't infer subject ID uniqueness between scanners, agents, etc
     * Emits a ERC1155.TransferSingle event and StakeDeposited (to allow accounting per subject type)
     */
    function deposit(uint8 subjectType, uint256 subject, uint256 stakeValue)
        public
        onlyValidSubjectType(subjectType)
        onlyValidSubject(subject)
        returns (uint256)
    {
        require(subject > 0, "FortaStaking: cannot stake on subject 0");
        address staker = _msgSender();
        uint256 activeSharesId = FortaStakingUtils.subjectToActive(subjectType, subject);

        uint256 sharesValue = _stakeToActiveShares(activeSharesId, stakeValue);
        SafeERC20.safeTransferFrom(stakedToken, staker, address(this), stakeValue);

        _activeStake.mint(activeSharesId, stakeValue);
        _mint(staker, activeSharesId, sharesValue, new bytes(0));
        emit StakeDeposited(subjectType, subject, staker, stakeValue);
        _emitHook(abi.encodeWithSignature("hook_afterStakeChanged(uint8, uint256)", subjectType, subject));
        return sharesValue;
    }

    /**
     * @dev Schedule the withdrawal of shares.
     *
     * Emits a WithdrawalInitiated event.
     */
    function initiateWithdrawal(uint8 subjectType, uint256 subject, uint256 sharesValue)
        public
        onlyValidSubjectType(subjectType)
        onlyValidSubject(subject) 
        returns (uint64)
    {
        address staker = _msgSender();
        uint256 activeSharesId = FortaStakingUtils.subjectToActive(subjectType, subject);
        uint64 deadline = SafeCast.toUint64(block.timestamp) + _withdrawalDelay;

        _lockingDelay[activeSharesId][staker].setDeadline(deadline);

        uint256 activeShares   = Math.min(sharesValue, balanceOf(staker, activeSharesId));
        uint256 stakeValue     = _activeSharesToStake(activeSharesId, activeShares);
        uint256 inactiveShares = _stakeToInactiveShares(FortaStakingUtils.activeToInactive(activeSharesId), stakeValue);

        _activeStake.burn(activeSharesId, stakeValue);
        _inactiveStake.mint(FortaStakingUtils.activeToInactive(activeSharesId), stakeValue);
        _burn(staker, activeSharesId, activeShares);
        _mint(staker, FortaStakingUtils.activeToInactive(activeSharesId), inactiveShares, new bytes(0));

        emit WithdrawalInitiated(subjectType, subject, staker, deadline);

        _emitHook(abi.encodeWithSignature("hook_afterStakeChanged(uint8, uint256)", subjectType, subject));
        return deadline;
    }

    /**
     * @dev Burn `sharesValue` shares for a given `subject`, and withdraw the corresponding tokens.
     *
     * Emits events WithdrawalExecuted and ERC1155.TransferSingle.
     */
    function withdraw(uint8 subjectType, uint256 subject)
        public
        onlyValidSubjectType(subjectType)
        onlyValidSubject(subject)
        returns (uint256)
    {
        address staker = _msgSender();
        uint256 inactiveSharesId = FortaStakingUtils.subjectToInactive(subjectType, subject);
        require(!_frozen[FortaStakingUtils.inactiveToActive(inactiveSharesId)], "Subject unstaking is currently frozen");

        Timers.Timestamp storage timer = _lockingDelay[FortaStakingUtils.inactiveToActive(inactiveSharesId)][staker];
        require(timer.isExpired(), 'Withdrawal is not ready');
        timer.reset();
        emit WithdrawalExecuted(subjectType, subject, staker);

        uint256 inactiveShares = balanceOf(staker, inactiveSharesId);
        uint256 stakeValue     = _inactiveSharesToStake(inactiveSharesId, inactiveShares);

        _inactiveStake.burn(inactiveSharesId, stakeValue);
        _burn(staker, inactiveSharesId, inactiveShares);
        SafeERC20.safeTransfer(stakedToken, staker, stakeValue);

        _emitHook(abi.encodeWithSignature("hook_afterStakeChanged(uint8, uint256)", subjectType, subject));

        return stakeValue;
    }

    /**
     * @dev Slash a fraction of a subject stake, and transfer it to the treasury. Restricted to the `SLASHER_ROLE`.
     *
     * Emits a Slashed event.
     */
    function slash(uint8 subjectType, uint256 subject, uint256 stakeValue)
        public
        onlyRole(SLASHER_ROLE)
        onlyValidSubjectType(subjectType)
        onlyValidSubject(subject)
        returns (uint256)
    {
        uint256 activeSharesId = FortaStakingUtils.subjectToActive(subjectType, subject);
        uint256 activeStake       = _activeStake.balanceOf(activeSharesId);
        uint256 inactiveStake     = _inactiveStake.balanceOf(FortaStakingUtils.activeToInactive(activeSharesId));

        uint256 maxSlashableStake = FullMath.mulDiv(9, 10, activeStake + inactiveStake);
        require(stakeValue <= maxSlashableStake, "Stake to be slashed is over 90%");

        uint256 slashFromActive   = FullMath.mulDiv(activeStake, activeStake + inactiveStake, stakeValue);
        uint256 slashFromInactive = stakeValue - slashFromActive;
        stakeValue                = slashFromActive + slashFromInactive;

        _activeStake.burn(activeSharesId, slashFromActive);
        _inactiveStake.burn(FortaStakingUtils.activeToInactive(activeSharesId), slashFromInactive);
        SafeERC20.safeTransfer(stakedToken, _treasury, stakeValue);

        emit Slashed(subjectType, subject, _msgSender(), stakeValue);

        _emitHook(abi.encodeWithSignature("hook_afterStakeChanged(uint8, uint256)", subjectType, subject));

        return stakeValue;
    }

    /**
     * @dev Freeze/unfreeze a subject stake. Restricted to the `SLASHER_ROLE`.
     *
     * Emits a Freeze event.
     */
    function freeze(uint8 subjectType, uint256 subject, bool frozen)
        public
        onlyRole(SLASHER_ROLE)
        onlyValidSubjectType(subjectType)
    {
        _frozen[FortaStakingUtils.subjectToActive(subjectType, subject)] = frozen;
        emit Froze(subjectType, subject, _msgSender(), frozen);
    }

    /**
    * @dev Deposit reward value for a given `subject`. The corresponding tokens will be shared amongst the shareholders
    * of this subject.
    *
    * Emits a Reward event.
    */
    function reward(uint8 subjectType, uint256 subject, uint256 value)
        public
        onlyValidSubjectType(subjectType)
        onlyValidSubject(subject)
    {
        SafeERC20.safeTransferFrom(stakedToken, _msgSender(), address(this), value);
        _rewards.mint(FortaStakingUtils.subjectToActive(subjectType, subject), value);

        emit Rewarded(subjectType, subject, _msgSender(), value);
    }

    /**
     * @dev Sweep all token that might be mistakenly sent to the contract. This covers both unrelated tokens and staked
     * tokens that would be sent through a direct transfer.
     */
    function sweep(IERC20 token, address recipient) public onlyRole(SWEEPER_ROLE) returns (uint256) {
        uint256 amount = token.balanceOf(address(this));

        if (token == stakedToken) {
            amount -= totalActiveStake();
            amount -= totalInactiveStake();
            amount -= _rewards.totalSupply();
        }

        SafeERC20.safeTransfer(token, recipient, amount);

        return amount;
    }

    /**
     * @dev Release reward owed by given `account` for its current or past share for a given `subject`.
     *
     * Emits a Release event.
     */
    function releaseReward(uint8 subjectType, uint256 subject, address account)
        public
        onlyValidSubjectType(subjectType)
        onlyValidSubject(subject)
        returns (uint256)
    {
        uint256 value = availableReward(subjectType, subject, account);
        uint256 activeSharesId = FortaStakingUtils.subjectToActive(subjectType, subject);
        _rewards.burn(activeSharesId, value);
        _released[activeSharesId].mint(account, SafeCast.toInt256(value));

        SafeERC20.safeTransfer(stakedToken, account, value);

        emit Released(subjectType, subject, account, value);

        if (Address.isContract(account)) {
            try IRewardReceiver(account).onRewardReceived(subjectType, subject, value) {}
            catch {}
        }

        return value;
    }

    /**
     * @dev Amount of reward tokens owed by given `account` for its current or past share for a given `subject`.
     */
    function availableReward(uint8 subjectType, uint256 subject, address account) public view returns (uint256) {
        uint256 activeSharesId = FortaStakingUtils.subjectToActive(subjectType, subject);
        return SafeCast.toUint256(
            SafeCast.toInt256(_historicalRewardFraction(activeSharesId, balanceOf(account, activeSharesId)))
            -
            _released[activeSharesId].balanceOf(account)
        );
    }

    /**
     * @dev Relay a ERC2612 permit signature to the staked token. This cal be bundled with a {deposit} or a {reward}
     * operation using Multicall.
     */
    function relayPermit(
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public {
        IERC2612(address(stakedToken)).permit(_msgSender(), address(this), value, deadline, v, r, s);
    }

    // Internal helpers
    function _totalHistoricalReward(uint256 activeSharesId) internal view returns (uint256) {
        return SafeCast.toUint256(
            SafeCast.toInt256(_rewards.balanceOf(activeSharesId))
            +
            _released[activeSharesId].totalSupply()
        );
    }

    function _historicalRewardFraction(uint256 activeSharesId, uint256 amount) internal view returns (uint256) {
        uint256 supply = totalSupply(activeSharesId);
        return amount > 0 && supply > 0 ? FullMath.mulDiv(amount, supply, _totalHistoricalReward(activeSharesId)) : 0;
    }

    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal virtual override {

        // Order is important here, we must do the virtual release, which uses totalSupply(activeSharesId) in
        // _historicalRewardFraction, BEFORE the super call updates the totalSupply()
        for (uint256 i = 0; i < ids.length; ++i) {
            if (FortaStakingUtils.isActive(ids[i])) {
                // Mint, burn, or transfer of subject shares would by default affect the distribution of the
                // currently available reward for the subject. We create a "virtual release" that should preserve
                // reward distribution as it was prior to the transfer.
                int256 virtualRelease = SafeCast.toInt256(
                    _historicalRewardFraction(
                        ids[i],
                        amounts[i]
                    )
                );
                if (from == address(0)) {
                    _released[ids[i]].mint(to, virtualRelease);
                } else if (to == address(0)) {
                    _released[ids[i]].burn(from, virtualRelease);
                } else {
                    _released[ids[i]].transfer(from, to, virtualRelease);
                }
            } else {
                require(from == address(0) || to == address(0), "Withdrawal shares are not transferable");
            }
        }

        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
    }

    // Conversions
    function _stakeToActiveShares(uint256 activeSharesId, uint256 amount) internal view returns (uint256) {
        uint256 activeStake = _activeStake.balanceOf(activeSharesId);
        return activeStake == 0 ? amount : FullMath.mulDiv(amount, activeStake, totalSupply(activeSharesId));
    }

    function _stakeToInactiveShares(uint256 inactiveSharesId, uint256 amount) internal view returns (uint256) {
        uint256 inactiveStake = _inactiveStake.balanceOf(inactiveSharesId);
        return inactiveStake == 0 ? amount : FullMath.mulDiv(amount, inactiveStake, totalSupply(inactiveSharesId));
    }

    function _activeSharesToStake(uint256 activeSharesId, uint256 amount) internal view returns (uint256) {
        uint256 activeSupply = totalSupply(activeSharesId);
        return activeSupply == 0 ? 0 : FullMath.mulDiv(amount, activeSupply, _activeStake.balanceOf(activeSharesId));
    }
    function _inactiveSharesToStake(uint256 inactiveSharesId, uint256 amount) internal view returns (uint256) {
        uint256 inactiveSupply = totalSupply(inactiveSharesId);
        return inactiveSupply == 0 ? 0 : FullMath.mulDiv(amount, inactiveSupply, _inactiveStake.balanceOf(inactiveSharesId));
    }

    // Admin: change withdrawal delay
    function setDelay(uint64 newDelay) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _withdrawalDelay = newDelay;
        emit DelaySet(newDelay);
    }

    // Admin: change recipient of slashed funds
    function setTreasury(address newTreasury) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _treasury = newTreasury;
        emit TreasurySet(newTreasury);
    }

    function setURI(string memory newUri) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(newUri);
    }

    function _msgSender() internal view virtual override(ContextUpgradeable, BaseComponent) returns (address sender) {
        return super._msgSender();
    }

    function _msgData() internal view virtual override(ContextUpgradeable, BaseComponent) returns (bytes calldata) {
        return super._msgData();
    }

    uint256[41] private __gap;
}