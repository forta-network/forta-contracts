// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/interfaces/draft-IERC2612.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/utils/Timers.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";

import "./FortaStakingUtils.sol";
import "./SubjectTypes.sol";
import "./IStakeController.sol";
import "../BaseComponentUpgradeable.sol";
import "../../tools/Distributions.sol";
import "../../tools/FullMath.sol";
import "../../errors/GeneralErrors.sol";

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
 * 
 * WARNING: To stake from another smart contract (smart contract wallets included), it must be fully ERC1155 compatible,
 * implementing ERC1155Receiver. If not, minting of active and inactive shares will fail.
 * Do not deposit on the constructor if you don't implement ERC1155Receiver. During the construction, the minting will
 * succeed but you will not be able to withdraw or mint new shares from the contract. If this happens, transfer your
 * shares to an EOA or fully ERC1155 compatible contract.
 */
contract FortaStaking is BaseComponentUpgradeable, ERC1155SupplyUpgradeable, SubjectTypeValidator {
    using Distributions for Distributions.Balances;
    using Distributions for Distributions.SignedBalances;
    using Timers        for Timers.Timestamp;
    using ERC165Checker for address;

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

    IStakeController private _stakingParameters;

    event StakeDeposited(uint8 indexed subjectType, uint256 indexed subject, address indexed account, uint256 amount);
    event WithdrawalInitiated(uint8 indexed subjectType, uint256 indexed subject, address indexed account, uint64 deadline);
    event WithdrawalExecuted(uint8 indexed subjectType, uint256 indexed subject, address indexed account);
    event Froze(uint8 indexed subjectType, uint256 indexed subject, address indexed by, bool isFrozen);
    event Slashed(uint8 indexed subjectType, uint256 indexed subject, address indexed by, uint256 value);
    event Rewarded(uint8 indexed subjectType, uint256 indexed subject, address indexed from, uint256 value);
    event Released(uint8 indexed subjectType, uint256 indexed subject, address indexed to, uint256 value);
    event DelaySet(uint256 newWithdrawalDelay);
    event TreasurySet(address newTreasury);
    event StakeParamsManagerSet(address indexed newManager);
    event MaxStakeReached(uint8 indexed subjectType, uint256 indexed subject);
    event TokensSwept(address indexed token, address to, uint256 amount);

    error WithdrawalNotReady();
    error SlashingOver90Percent();
    error WithdrawalSharesNotTransferible();
    error FrozenSubject();
    error NoActiveShares();
    error NoInactiveShares();
    error StakeInactiveOrSubjectNotFound();

    string public constant version = "0.1.0";

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     * @param __router address of Router.
     * @param __stakedToken ERC20 to be staked (FORT).
     * @param __withdrawalDelay cooldown period between withdrawal init and withdrawal (in seconds).
     * @param __treasury address where the slashed tokens go to.
     */
    function initialize(
        address __manager,
        address __router,
        IERC20 __stakedToken,
        uint64 __withdrawalDelay,
        address __treasury
    ) public initializer {
        if (__treasury == address(0)) revert ZeroAddress("__treasury");
        __AccessManaged_init(__manager);
        __Routed_init(__router);
        __UUPSUpgradeable_init();
        __ERC1155_init("");
        __ERC1155Supply_init();
        stakedToken = __stakedToken;
        _withdrawalDelay = __withdrawalDelay;
        _treasury = __treasury;
        emit DelaySet(__withdrawalDelay);
        emit TreasurySet(__treasury);
    }

    /**
     * @notice Get stake of a subject (not marked for withdrawal).
     * @param subjectType agents, scanner or future types of stake subject. See SubjectTypes.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @return amount of stakedToken actively staked on subject+subjectType.
     */
    function activeStakeFor(uint8 subjectType, uint256 subject) public view returns (uint256) {
        return _activeStake.balanceOf(FortaStakingUtils.subjectToActive(subjectType, subject));
    }

    /**
     * @notice Get total active stake of all subjects (not marked for withdrawal).
     * @return amount of stakedToken actively staked on all subject+subjectTypes.
     */
    function totalActiveStake() public view returns (uint256) {
        return _activeStake.totalSupply();
    }

    /**
     * @notice Get inactive stake of a subject (marked for withdrawal).
     * @param subjectType agents, scanner or future types of stake subject. See SubjectTypes.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @return amount of stakedToken still staked on subject+subjectType but marked for withdrawal.
     */
    function inactiveStakeFor(uint8 subjectType, uint256 subject) external view returns (uint256) {
        return _inactiveStake.balanceOf(FortaStakingUtils.subjectToInactive(subjectType, subject));
    }


    /**
     * @notice Get total inactive stake of all subjects (marked for withdrawal).
     * @return amount of stakedToken still staked on all subject+subjectTypes but marked for withdrawal.
     */
    function totalInactiveStake() public view returns (uint256) {
        return _inactiveStake.totalSupply();
    }

    /**
     * @notice Get (active) shares of an account on a subject, corresponding to a fraction of the subject stake.
     * @dev This is equivalent to getting the ERC1155 balanceOf for keccak256(abi.encodePacked(subjectType, subject)),
     * shifted 9 bits, with the 9th bit set and uint8(subjectType) masked in
     * @param subjectType agents, scanner or future types of stake subject. See SubjectTypes.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param account holder of the ERC1155 staking shares.
     * @return amount of ERC1155 shares account is in possession in representing stake on subject+subjectType.
     */
    function sharesOf(uint8 subjectType, uint256 subject, address account) public view returns (uint256) {
        return balanceOf(account, FortaStakingUtils.subjectToActive(subjectType, subject));
    }

    /**
     * @notice Get the total (active) shares on a subject.
     * @dev This is equivalent to getting the ERC1155 totalSupply for keccak256(abi.encodePacked(subjectType, subject)),
     * shifted 9 bits, with the 9th bit set and uint8(subjectType) masked in
     * @param subjectType agents, scanner or future types of stake subject. See SubjectTypes.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @return total ERC1155 shares representing stake on subject+subjectType.
     */
    function totalShares(uint8 subjectType, uint256 subject) external view returns (uint256) {
        return totalSupply(FortaStakingUtils.subjectToActive(subjectType, subject));
    }

    /**
     * @notice Get inactive shares of an account on a subject, corresponding to a fraction of the subject inactive stake.
     * @dev This is equivalent to getting the ERC1155 balanceOf for keccak256(abi.encodePacked(subjectType, subject)),
     * shifted 9 bits, with the 9th bit unset and uint8(subjectType) masked in.
     * @param subjectType agents, scanner or future types of stake subject. See SubjectTypes.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param account holder of the ERC1155 staking shares.
     * @return amount of ERC1155 shares account is in possession in representing inactive stake on subject+subjectType, marked for withdrawal.
     */
    function inactiveSharesOf(uint8 subjectType, uint256 subject, address account) external view returns (uint256) {
        return balanceOf(account, FortaStakingUtils.subjectToInactive(subjectType, subject));
    }

    /**
     * @notice Get the total inactive shares on a subject.
     * @dev This is equivalent to getting the ERC1155 totalSupply for keccak256(abi.encodePacked(subjectType, subject)),
     * shifted 9 bits, with the 9th bit unset and uint8(subjectType) masked in
     * @param subjectType agents, scanner or future types of stake subject. See SubjectTypes.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @return total ERC1155 shares representing inactive stake on subject+subjectType, marked for withdrawal.
     */
    function totalInactiveShares(uint8 subjectType, uint256 subject) external view returns (uint256) {
        return totalSupply(FortaStakingUtils.subjectToInactive(subjectType, subject));
    }

    /**
     * @notice Checks if a subject frozen (stake of frozen subject cannot be withdrawn).
     * @param subjectType agents, scanner or future types of stake subject. See SubjectTypes.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @return true if subject is frozen, false otherwise
     */
    function isFrozen(uint8 subjectType, uint256 subject) public view returns (bool) {
        return _frozen[FortaStakingUtils.subjectToActive(subjectType, subject)];
    }

    /**
     * @notice Deposit `stakeValue` tokens for a given `subject`, and mint the corresponding active ERC1155 shares.
     * will return tokens staked over maximum for the subject.
     * If stakeValue would drive the stake over the maximum, only stakeValue - excess is transferred, but transaction will
     * not fail.
     * Reverts if max stake for subjectType not set, or subject not found
     * @dev NOTE: Subject type is necessary because we can't infer subject ID uniqueness between scanners, agents, etc
     * Emits a ERC1155.TransferSingle event and StakeDeposited (to allow accounting per subject type)
     * Emits MaxStakeReached(subjectType, activeSharesId)
     * WARNING: To stake from another smart contract (smart contract wallets included), it must be fully ERC1155 compatible,
     * implementing ERC1155Receiver. If not, minting of active and inactive shares will fail.
     * Do not deposit on the constructor if you don't implement ERC1155Receiver. During the construction, the minting will
     * succeed but you will not be able to withdraw or mint new shares from the contract. If this happens, transfer your
     * shares to an EOA or fully ERC1155 compatible contract.
     * @param subjectType agents, scanner or future types of stake subject. See SubjectTypes.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param stakeValue amount of staked token.
     * @return amount of ERC1155 active shares minted.
     */
    function deposit(uint8 subjectType, uint256 subject, uint256 stakeValue)
        public
        onlyValidSubjectType(subjectType)
        returns (uint256)
    {
        if (address(_stakingParameters) == address(0)) revert ZeroAddress("_stakingParameters");
        if (!_stakingParameters.isStakeActivatedFor(subjectType, subject)) revert StakeInactiveOrSubjectNotFound();
        address staker = _msgSender();
        uint256 activeSharesId = FortaStakingUtils.subjectToActive(subjectType, subject);
        bool reachedMax;
        (stakeValue, reachedMax) = _getInboundStake(subjectType, subject, stakeValue);
        if (reachedMax) {
            emit MaxStakeReached(subjectType, subject);
        }
        uint256 sharesValue = _stakeToActiveShares(activeSharesId, stakeValue);
        SafeERC20.safeTransferFrom(stakedToken, staker, address(this), stakeValue);

        _activeStake.mint(activeSharesId, stakeValue);
        _mint(staker, activeSharesId, sharesValue, new bytes(0));
        emit StakeDeposited(subjectType, subject, staker, stakeValue);
        // NOTE: hooks will be reintroduced (with more info) when first use case is implemented. For now they are removed
        // to reduce attack surface.
        // _emitHook(abi.encodeWithSignature("hook_afterStakeChanged(uint8, uint256)", subjectType, subject));
        return sharesValue;
    }

    /**
    * Calculates how much of the incoming stake fits for subject.
    * @param subjectType valid subect type
    * @param subject the id of the subject
    * @param stakeValue stake sent by staker
    * @return stakeValue - excess
    * @return true if reached max
    */
    function _getInboundStake(uint8 subjectType, uint256 subject, uint256 stakeValue) private view returns (uint256, bool) {
        uint256 max = _stakingParameters.maxStakeFor(subjectType, subject);
        if (activeStakeFor(subjectType, subject) >= max) {
            return (0, true);
        } else {
            uint256 stakeLeft = max - activeStakeFor(subjectType, subject);
            return (
                Math.min(
                    stakeValue, // what the user wants to stake
                    stakeLeft // what is actually left
                ),
                activeStakeFor(subjectType, subject) + stakeValue >= max
            );
        }
    }

    /** @notice Starts the withdrawal process for an amount of shares. Burns active shares and mints inactive
     * shares (non transferrable). Stake will be available for withdraw() after _withdrawalDelay. If the 
     * subject has not been slashed, the shares will correspond 1:1 with stake.
     * @dev Emits a WithdrawalInitiated event.
     * @param subjectType agents, scanner or future types of stake subject. See SubjectTypes.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param sharesValue amount of shares token.
     * @return amount of time until withdrawal is valid.
     */
    function initiateWithdrawal(uint8 subjectType, uint256 subject, uint256 sharesValue)
        public
        onlyValidSubjectType(subjectType)
        returns (uint64)
    {
        address staker = _msgSender();
        uint256 activeSharesId = FortaStakingUtils.subjectToActive(subjectType, subject);
        if (balanceOf(staker, activeSharesId) == 0) revert NoActiveShares();
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
        // NOTE: hooks will be reintroduced (with more info) when first use case is implemented. For now they are removed
        // to reduce attack surface.
        // _emitHook(abi.encodeWithSignature("hook_afterStakeChanged(uint8, uint256)", subjectType, subject));
        return deadline;
    }

    /**
     * @notice Burn `sharesValue` inactive shares for a given `subject`, and withdraw the corresponding tokens
     * (if the subject type has not been frozen, and the withdrawal delay time has passed).
     * @dev shars must have been marked for withdrawal before by initiateWithdrawal().
     * Emits events WithdrawalExecuted and ERC1155.TransferSingle.
     * @param subjectType agents, scanner or future types of stake subject. See SubjectTypes.sol
     * @param subject id identifying subject (external to FortaStaking).  
     * @return amount of withdrawn staked tokens.   
     */
    function withdraw(uint8 subjectType, uint256 subject)
        public
        onlyValidSubjectType(subjectType)
        returns (uint256)
    {
        address staker = _msgSender();
        uint256 inactiveSharesId = FortaStakingUtils.subjectToInactive(subjectType, subject);
        if (balanceOf(staker, inactiveSharesId) == 0) revert NoInactiveShares();
        if (_frozen[FortaStakingUtils.inactiveToActive(inactiveSharesId)]) revert FrozenSubject();

        Timers.Timestamp storage timer = _lockingDelay[FortaStakingUtils.inactiveToActive(inactiveSharesId)][staker];
        if (!timer.isExpired()) revert WithdrawalNotReady();
        timer.reset();
        emit WithdrawalExecuted(subjectType, subject, staker);

        uint256 inactiveShares = balanceOf(staker, inactiveSharesId);
        uint256 stakeValue     = _inactiveSharesToStake(inactiveSharesId, inactiveShares);

        _inactiveStake.burn(inactiveSharesId, stakeValue);
        _burn(staker, inactiveSharesId, inactiveShares);
        SafeERC20.safeTransfer(stakedToken, staker, stakeValue);
        // NOTE: hooks will be reintroduced (with more info) when first use case is implemented. For now they are removed
        // to reduce attack surface.
        // _emitHook(abi.encodeWithSignature("hook_afterStakeChanged(uint8, uint256)", subjectType, subject));

        return stakeValue;
    }

    /**
     * @notice Slash a fraction of a subject stake, and transfer it to the treasury. Restricted to the `SLASHER_ROLE`.
     * @dev This will alter the relationship between shares and stake, reducing shares value for a subject.
     * Emits a Slashed event.
     * @param subjectType agents, scanner or future types of stake subject. See SubjectTypes.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param stakeValue amount of staked token.
     * @return stakeValue
     */
    function slash(uint8 subjectType, uint256 subject, uint256 stakeValue)
        public
        onlyRole(SLASHER_ROLE)
        onlyValidSubjectType(subjectType)
        returns (uint256)
    {
        uint256 activeSharesId = FortaStakingUtils.subjectToActive(subjectType, subject);
        uint256 activeStake       = _activeStake.balanceOf(activeSharesId);
        uint256 inactiveStake     = _inactiveStake.balanceOf(FortaStakingUtils.activeToInactive(activeSharesId));

        // We set the slash limit at 90% of the stake, so new depositors on slashed pools (with now 0 stake) won't mint 
        // an amounts of shares so big that they might cause overflows. 
        // New shares = pool shares * new staked amount / pool stake
        // See deposit and _stakeToActiveShares methods.
        uint256 maxSlashableStake = FullMath.mulDiv(9, 10, activeStake + inactiveStake);
        if (stakeValue > maxSlashableStake) revert SlashingOver90Percent();

        uint256 slashFromActive   = FullMath.mulDiv(activeStake, activeStake + inactiveStake, stakeValue);
        uint256 slashFromInactive = stakeValue - slashFromActive;
        stakeValue                = slashFromActive + slashFromInactive;

        _activeStake.burn(activeSharesId, slashFromActive);
        _inactiveStake.burn(FortaStakingUtils.activeToInactive(activeSharesId), slashFromInactive);
        SafeERC20.safeTransfer(stakedToken, _treasury, stakeValue);

        emit Slashed(subjectType, subject, _msgSender(), stakeValue);
        // NOTE: hooks will be reintroduced (with more info) when first use case is implemented. For now they are removed
        // to reduce attack surface.
        // _emitHook(abi.encodeWithSignature("hook_afterStakeChanged(uint8, uint256)", subjectType, subject));

        return stakeValue;
    }

    /**
     * @notice Freeze/unfreeze withdrawal of a subject stake. This will be used when something suspicious happens 
     * with a subject but there is not a strong case yet for slashing.
     * Restricted to the `SLASHER_ROLE`.
     * @dev Emits a Freeze event.
     * @param subjectType agents, scanner or future types of stake subject. See SubjectTypes.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param frozen true to freeze, false to unfreeze.
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
     * @notice Deposit reward value for a given `subject`. The corresponding tokens will be shared amongst the shareholders
     * of this subject.
     * @dev Emits a Reward event.
     * @param subjectType agents, scanner or future types of stake subject. See SubjectTypes.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param value amount of reward tokens.
     */
    function reward(uint8 subjectType, uint256 subject, uint256 value) public onlyValidSubjectType(subjectType)  {   
        SafeERC20.safeTransferFrom(stakedToken, _msgSender(), address(this), value);
        _rewards.mint(FortaStakingUtils.subjectToActive(subjectType, subject), value);

        emit Rewarded(subjectType, subject, _msgSender(), value);
    }

    /**
     * @notice Sweep all token that might be mistakenly sent to the contract. This covers both unrelated tokens and staked
     * tokens that would be sent through a direct transfer. Restricted to SWEEPER_ROLE.
     * If tokens are the same as staked tokens, only the extra tokens (no stake or rewards) will be transferred.
     * @dev WARNING: thoroughly review the token to b
     * @param token address of the token to be swept.
     * @param recipient destination address of the swept tokens
     * @return amount of tokens swept. For unrelated tokens is FortaStaking's balance, for stakedToken its
     * the balance over the active stake + inactive stake + rewards 
     */
    function sweep(IERC20 token, address recipient) public onlyRole(SWEEPER_ROLE) returns (uint256) {
        uint256 amount = token.balanceOf(address(this));

        if (token == stakedToken) {
            amount -= totalActiveStake();
            amount -= totalInactiveStake();
            amount -= _rewards.totalSupply();
        }

        SafeERC20.safeTransfer(token, recipient, amount);
        emit TokensSwept(address(token), recipient, amount);
        return amount;
    }

    /**
     * @notice Release reward owed by given `account` for its current or past share for a given `subject`.
     * @dev If staking from a contract, said contract may optionally implement ERC165 for IRewardReceiver.
     * Emits a Release event.
     * @param subjectType agents, scanner or future types of stake subject. See SubjectTypes.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param account that staked on the subject.
     * @return available reward transferred.
     */
    function releaseReward(uint8 subjectType, uint256 subject, address account)
        public
        onlyValidSubjectType(subjectType)
        returns (uint256)
    {
        uint256 activeSharesId = FortaStakingUtils.subjectToActive(subjectType, subject);
        uint256 value = _availableReward(activeSharesId, account);
        _rewards.burn(activeSharesId, value);
        _released[activeSharesId].mint(account, SafeCast.toInt256(value));

        SafeERC20.safeTransfer(stakedToken, account, value);

        emit Released(subjectType, subject, account, value);

        if (Address.isContract(account) && account.supportsInterface(type(IRewardReceiver).interfaceId)) {
            IRewardReceiver(account).onRewardReceived(subjectType, subject, value);
        }

        return value;
    }

    /**
     * @notice Amount of reward tokens owed by given `account` for its current or past share for a given `subject`.
     * @param activeSharesId ERC1155 id representing the active shares of a subject / subjectType pair.
     * @param account address of the staker
     * @return rewards available for staker on that subject.
     */
    function _availableReward(uint256 activeSharesId, address account) internal view returns (uint256) {
        return SafeCast.toUint256(
            SafeCast.toInt256(_historicalRewardFraction(activeSharesId, balanceOf(account, activeSharesId)))
            -
            _released[activeSharesId].balanceOf(account)
        );
    }

    /**
     * @dev Amount of reward tokens owed by given `account` for its current or past share for a given `subject`.
     * @param subjectType type of staking subject (see SubjectTypes.sol)
     * @param subject ID of subject
     * @param account address of the staker
     * @return rewards available for staker on that subject.
     */
    function availableReward(uint8 subjectType, uint256 subject, address account) external view returns (uint256) {
        uint256 activeSharesId = FortaStakingUtils.subjectToActive(subjectType, subject);
        return _availableReward(activeSharesId, account);
    }

    /**
     * @dev Relay a ERC2612 permit signature to the staked token. This cal be bundled with a {deposit} or a {reward}
     * operation using Multicall.
     * @param value amount of token allowance for deposit/reward
     * @param deadline for the meta-tx to be relayed.
     * @param v part of signature
     * @param r part of signature
     * @param s part of signature
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
        for (uint256 i = 0; i < ids.length; i++) {
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
                if (!(from == address(0) || to == address(0))) revert WithdrawalSharesNotTransferible();
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

    /**
     * @notice Sets withdrawal delay. Restricted to DEFAULT_ADMIN_ROLE
     * @param newDelay in seconds.
     */
    function setDelay(uint64 newDelay) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _withdrawalDelay = newDelay;
        emit DelaySet(newDelay);
    }

    /**
     * @notice Sets destination of slashed tokens. Restricted to DEFAULT_ADMIN_ROLE
     * @param newTreasury address.
     */
    function setTreasury(address newTreasury) public onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress("newTreasury");
        _treasury = newTreasury;
        emit TreasurySet(newTreasury);
    }

    // Admin: change staking parameters manager
    function setStakingParametersManager(IStakeController newStakingParameters) public onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(newStakingParameters) == address(0)) revert ZeroAddress("newStakingParameters");
        emit StakeParamsManagerSet(address(newStakingParameters));
        _stakingParameters = newStakingParameters;
    }


    // Overrides

    /**
     * @notice Sets URI of the ERC1155 tokens. Restricted to DEFAULT_ADMIN_ROLE
     * @param newUri root of the hosted metadata.
     */
    function setURI(string memory newUri) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(newUri);
    }

    /**
     * @notice Helper to get either msg msg.sender if not a meta transaction, signer of forwarder metatx if it is.
     * @inheritdoc ForwardedContext
     */
    function _msgSender() internal view virtual override(ContextUpgradeable, BaseComponentUpgradeable) returns (address sender) {
        return super._msgSender();
    }

    /**
     * @notice Helper to get msg.data if not a meta transaction, forwarder data in metatx if it is.
     * @inheritdoc ForwardedContext
     */
    function _msgData() internal view virtual override(ContextUpgradeable, BaseComponentUpgradeable) returns (bytes calldata) {
        return super._msgData();
    }

    uint256[40] private __gap;
}