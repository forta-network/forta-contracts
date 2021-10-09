// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/interfaces/draft-IERC2612.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/utils/Timers.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";

import "../BaseComponent.sol";
import "../../tools/Distributions.sol";
import "../../tools/FullMath.sol";

/**
 * @dev This is a generic staking contract for the Forta platform. It allows any account to deposit ERC20 tokens to
 * delegate their "power" by staking on behalf of a particular subject. The subject can be scanner, or any other actor
 * in the Forta ecosystem, who need to lock assets in order to contribute to the system.
 *
 * Stakers take risks with their funds, as bad action from a subject can lead to slashing of the funds. In the
 * meantime, stakers are elligible to rewards. Rewards distributed to a particular subject stakers are distributed
 * following to each staker's share in the subject.
 *
 * Stakers can withdraw their funds, following a withdrawal delay. During the withdrawal delay, funds are no longer
 * counting counting toward the active stake of a subject, but are still slashable.
 *
 * The SLASHER_ROLE should be bigen to a future smart contract that will be in charge of resolving disputes.
 *
 * Stakers receive ERC1155 shares in exchange for their stake, making the active stake transferable. When a withdrawal
 * is initiated, similar the ERC1155 tokens representing the (transferable) active shares are burned in exchange for
 * non-transferable ERC1155 tokens representing the inactives shares.
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
    mapping(address => mapping(address => Timers.Timestamp)) private _lockingDelay;

    // subject => reward
    Distributions.Balances private _rewards;
    // subject => staker => released reward
    mapping(address => Distributions.SignedBalances) private _released;

    // frozen tokens
    mapping(address => bool) private _frozen;

    // withdrawal delay
    uint64 private _withdrawalDelay;

    // treasury for slashing
    address private _treasury;

    event WithdrawalInitiated(address indexed subject, address indexed account, uint64 deadline);
    event WithdrawalExecuted(address indexed subject, address indexed account);
    event Froze(address indexed subject, address indexed by, bool isFrozen);
    event Slashed(address indexed subject, address indexed by, uint256 value);
    event Rewarded(address indexed subject, address indexed from, uint256 value);
    event Released(address indexed subject, address indexed to, uint256 value);
    event DelaySet(uint256 newWithdrawalDelay);
    event TreasurySet(address newTreasury);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

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
    function activeStakeFor(address subject) public view returns (uint256) {
        return _activeStake.balanceOf(subject);
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
    function inactiveStakeFor(address subject) public view returns (uint256) {
        return _inactiveStake.balanceOf(subject);
    }

    /**
     * @dev Get total stake inactive for withdrawal of all subjects
     */
    function totalInactiveStake() public view returns (uint256) {
        return _inactiveStake.totalSupply();
    }

    /**
     * @dev Get shares of an account on a subject, corresponding to a fraction of the subject stake.
     *
     * NOTE: This is equivalent to getting the ERC1155 balance of `account` with `subject` casted to a uint256 tokenId.
     */
    function sharesOf(address subject, address account) public view returns (uint256) {
        return balanceOf(account, _subjectToActive(subject));
    }

    /**
     * @dev Get the total shares on a subject.
     *
     * NOTE: This is equivalent to getting the ERC1155 totalSupply for `subject` casted to a uint256 tokenId.
     */
    function totalShares(address subject) public view returns (uint256) {
        return totalSupply(_subjectToActive(subject));
    }

    /**
     * @dev Get inactive shares of an account on a subject, corresponding to a fraction of the subject inactive stake.
     *
     * NOTE: This is equivalent to getting the ERC1155 balance of `account` with `subject` casted to a uint256 tokenId
     * plus a mask corresponding to 2 ** 160.
     */
    function inactiveSharesOf(address subject, address account) public view returns (uint256) {
        return balanceOf(account, _subjectToInactive(subject));
    }

    /**
     * @dev Get the total shares on a subject.
     *
     * NOTE: This is equivalent to getting the ERC1155 balance of `account` with `subject` casted to a uint256 tokenId
     * plus a mask corresponding to 2 ** 160.
     */
    function totalInactiveShares(address subject) public view returns (uint256) {
        return totalSupply(_subjectToInactive(subject));
    }

    /**
     * @dev Is a subject frozen (stake of frozen subject cannot be withdrawn).
     */
    function isFrozen(address subject) public view returns (bool) {
        return _frozen[subject];
    }

    /**
     * @dev Deposit `stakeValue` tokens for a given `subject`, and mint the corresponding shares.
     *
     * Emits a ERC1155.TransferSingle event.
     */
    function deposit(address subject, uint256 stakeValue) public returns (uint256) {
        address staker = _msgSender();

        uint256 sharesValue = _stakeToActiveShares(subject, stakeValue);

        SafeERC20.safeTransferFrom(stakedToken, staker, address(this), stakeValue);
        _activeStake.mint(subject, stakeValue);
        _mint(staker, _subjectToActive(subject), sharesValue, new bytes(0));

        _emitHook(abi.encodeWithSignature("hook_afterStakeChanged(address)", subject));

        return sharesValue;
    }

    /**
     * @dev Schedule the withdrawal of shares.
     *
     * Emits a WithdrawalInitiated event.
     */
    function initiateWithdrawal(address subject, uint256 sharesValue) public returns (uint64) {
        address staker = _msgSender();

        uint64 deadline = SafeCast.toUint64(block.timestamp) + _withdrawalDelay;
        _lockingDelay[subject][staker].setDeadline(deadline);

        uint256 activeShares   = Math.min(sharesValue, sharesOf(subject, staker));
        uint256 stakeValue     = _activeSharesToStake(subject, activeShares);
        uint256 inactiveShares = _stakeToInactiveShares(subject, stakeValue);

        _activeStake.burn(subject, stakeValue);
        _inactiveStake.mint(subject, stakeValue);
        _burn(staker, _subjectToActive(subject), activeShares);
        _mint(staker, _subjectToInactive(subject), inactiveShares, new bytes(0));

        emit WithdrawalInitiated(subject, staker, deadline);

        _emitHook(abi.encodeWithSignature("hook_afterStakeChanged(address)", subject));

        return deadline;
    }

    /**
     * @dev Burn `sharesValue` shares for a given `subject`, and withdraw the corresponding tokens.
     *
     * Emits events WithdrawalExecuted and ERC1155.TransferSingle.
     */
    function withdraw(address subject) public returns (uint256) {
        address staker = _msgSender();

        require(!isFrozen(subject), "Subject unstaking is currently frozen");

        Timers.Timestamp storage timer = _lockingDelay[subject][staker];
        require(timer.isExpired(), 'Withdrawal is not ready');
        timer.reset();
        emit WithdrawalExecuted(subject, staker);

        uint256 inactiveShares = inactiveSharesOf(subject, staker);
        uint256 stakeValue     = _inactiveSharesToStake(subject, inactiveShares);

        _inactiveStake.burn(subject, stakeValue);
        _burn(staker, _subjectToInactive(subject), inactiveShares);
        SafeERC20.safeTransfer(stakedToken, staker, stakeValue);

        return stakeValue;
    }

    /**
     * @dev Slash a fraction of a subject stake, and transfer it to the treasury. Restricted to the `SLASHER_ROLE`.
     *
     * Emits a Slashed event.
     */
    function slash(address subject, uint256 stakeValue) public onlyRole(SLASHER_ROLE) returns (uint256) {
        uint256 activeStake       = _activeStake.balanceOf(subject);
        uint256 inactiveStake     = _inactiveStake.balanceOf(subject);

        uint256 maxSlashableStake = FullMath.mulDiv(9, 10, activeStake + inactiveStake);
        require(stakeValue <= maxSlashableStake, "Stake to be slashed is over 90%");

        uint256 slashFromActive   = FullMath.mulDiv(activeStake, activeStake + inactiveStake, stakeValue);
        uint256 slashFromInactive = stakeValue - slashFromActive;
        stakeValue                = slashFromActive + slashFromInactive;

        _activeStake.burn(subject, slashFromActive);
        _inactiveStake.burn(subject, slashFromInactive);
        SafeERC20.safeTransfer(stakedToken, _treasury, stakeValue);

        emit Slashed(subject, _msgSender(), stakeValue);

        _emitHook(abi.encodeWithSignature("hook_afterStakeChanged(address)", subject));

        return stakeValue;
    }

    /**
     * @dev Freeze/unfreeze a subject stake. Restricted to the `SLASHER_ROLE`.
     *
     * Emits a Freeze event.
     */
    function freeze(address subject, bool frozen) public onlyRole(SLASHER_ROLE) {
        _frozen[subject] = frozen;
        emit Froze(subject, _msgSender(), frozen);
    }

    /**
     * @dev Deposit reward value for a given `subject`. The corresponding tokens will be shared amongs the shareholders
     * of this subject.
     *
     * Emits a Reward event.
     */
    function reward(address subject, uint256 value) public {
        SafeERC20.safeTransferFrom(stakedToken, _msgSender(), address(this), value);
        _rewards.mint(subject, value);

        emit Rewarded(subject, _msgSender(), value);
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

        token.transfer(recipient, amount);

        return amount;
    }

    /**
     * @dev Release reward owed by given `account` for its current or past share for a given `subject`.
     *
     * Emits a Release event.
     */
    function releaseReward(address subject, address account) public returns (uint256) {
        uint256 value = availableReward(subject, account);

        _rewards.burn(subject, value);
        _released[subject].mint(account, SafeCast.toInt256(value));

        SafeERC20.safeTransfer(stakedToken, account, value);

        emit Released(subject, account, value);

        return value;
    }

    /**
     * @dev Amount of reward tokens owed by given `account` for its current or past share for a given `subject`.
     */
    function availableReward(address subject, address account) public view returns (uint256) {
        return SafeCast.toUint256(
            SafeCast.toInt256(_historicalRewardFraction(subject, sharesOf(subject, account)))
            -
            _released[subject].balanceOf( account)
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
    function _totalHistoricalReward(address subject) internal view returns (uint256) {
        return SafeCast.toUint256(SafeCast.toInt256(_rewards.balanceOf(subject)) + _released[subject].totalSupply());
    }

    function _historicalRewardFraction(address subject, uint256 amount) internal view returns (uint256) {
        uint256 supply = totalShares(subject);
        return amount > 0 && supply > 0 ? FullMath.mulDiv(amount, supply, _totalHistoricalReward(subject)) : 0;
    }

    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal virtual override {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);

        for (uint256 i = 0; i < ids.length; ++i) {
            if (ids[i] >> 160 == 0) {
                // active shares (ids[i] is the address of the subject)
                address subject = _sharesToSubject(ids[i]);

                // Mint, burn, or transfer of subject shares would by default affect the distribution of the
                // currently available reward for the subject. We create a "virtual release" that should preserve
                // reward distribution as it was prior to the transfer.
                int256 virtualRelease = SafeCast.toInt256(_historicalRewardFraction(subject, amounts[i]));
                if (from == address(0)) {
                    _released[subject].mint(to, virtualRelease);
                } else if (to == address(0)) {
                    _released[subject].burn(from, virtualRelease);
                } else {
                    _released[subject].transfer(from, to, virtualRelease);
                }
            } else {
                require(from == address(0) || to == address(0), "Withdrawal shares are not transferable");
            }
        }
    }

    // Conversions
    function _subjectToActive(address subject) private pure returns (uint256) { return uint256(uint160(subject)); }
    function _subjectToInactive(address subject) private pure returns (uint256) { return uint256(uint160(subject)) | 2 ** 160; }
    function _sharesToSubject(uint256 tokenId) private pure returns (address) { return address(uint160(tokenId)); }

    function _stakeToActiveShares(address subject, uint256 amount) internal view returns (uint256) {
        uint256 activeStake = _activeStake.balanceOf(subject);
        return activeStake == 0 ? amount : FullMath.mulDiv(amount, activeStake, totalShares(subject));
    }

    function _stakeToInactiveShares(address subject, uint256 amount) internal view returns (uint256) {
        uint256 inactiveStake = _inactiveStake.balanceOf(subject);
        return inactiveStake == 0 ? amount : FullMath.mulDiv(amount, inactiveStake, totalInactiveShares(subject));
    }

    function _activeSharesToStake(address subject, uint256 amount) internal view returns (uint256) {
        uint256 activeSupply = totalShares(subject);
        return activeSupply == 0 ? 0 : FullMath.mulDiv(amount, activeSupply, _activeStake.balanceOf(subject));
    }
    function _inactiveSharesToStake(address subject, uint256 amount) internal view returns (uint256) {
        uint256 inactiveSupply = totalInactiveShares(subject);
        return inactiveSupply == 0 ? 0 : FullMath.mulDiv(amount, inactiveSupply, _inactiveStake.balanceOf(subject));
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
}