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

contract FortaStaking is BaseComponent, ERC1155SupplyUpgradeable {
    using Distributions for Distributions.Balances;
    using Distributions for Distributions.SignedBalances;
    using Timers        for Timers.Timestamp;

    bytes32 public constant SLASHER_ROLE = keccak256("SLASHER_ROLE");

    IERC20 public stakedToken;

    // distribution of baseToken between subjects (address)
    Distributions.Balances private _activeStakes;
    Distributions.Balances private _lockedStakes;
    mapping(address => mapping(address => Timers.Timestamp)) private _lockingDelay;

    // reward splitting
    Distributions.Balances private _rewards;
    mapping(address => Distributions.SignedBalances) private _released;

    // frozen tokens
    mapping(address => bool) private _frozen;

    // withdrawal delay
    uint64 private _withdrawalDelay;

    // treasury for slashing
    address private _treasury;

    event WithdrawalInitiated(address indexed subject, address indexed account, uint64 deadline);
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

        stakedToken = __stakedToken;
        _withdrawalDelay = __withdrawalDelay;
        _treasury = __treasury;
        emit DelaySet(__withdrawalDelay);
        emit TreasurySet(__treasury);
    }

    /**
     * @dev Get stake of a subject
     */
    function stakeOf(address subject) public view returns (uint256) {
        return _activeStakes.balanceOf(subject);
    }

    /**
     * @dev Get total stake of all subjects
     */
    function totalStake() public view returns (uint256) {
        return _activeStakes.totalSupply();
    }

    /**
     * @dev Get stake locked for withdrawal of a subject
     */
    function lockedStakeOf(address subject) public view returns (uint256) {
        return _lockedStakes.balanceOf(subject);
    }

    /**
     * @dev Get total stake locked for withdrawal of all subjects
     */
    function totalLockedStake() public view returns (uint256) {
        return _lockedStakes.totalSupply();
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
        _activeStakes.mint(subject, stakeValue);
        _mint(staker, _subjectToActive(subject), sharesValue, new bytes(0));

        _emitHook(abi.encodeWithSignature("hook_afterStakeChanged(address)", subject));

        return sharesValue;
    }

    /**
     * @dev Schedule the withdrawal of shares.
     *
     * Emits a WithdrawalSheduled event.
     */
    function initiateWithdrawal(address subject, uint256 sharesValue) public returns (uint64) {
        address staker = _msgSender();

        uint64 deadline = SafeCast.toUint64(block.timestamp) + _withdrawalDelay;
        _lockingDelay[subject][staker].setDeadline(deadline);

        uint256 activeShares = Math.min(sharesValue, balanceOf(staker, _subjectToActive(subject)));
        uint256 stakeValue   = _activeSharesToStake(subject, activeShares);
        uint256 lockedShares = _stakeToLockedShares(subject, stakeValue);

        _activeStakes.burn(subject, stakeValue);
        _lockedStakes.mint(subject, stakeValue);
        _burn(staker, _subjectToActive(subject), activeShares);
        _mint(staker, _subjectToLocked(subject), lockedShares, new bytes(0));

        emit WithdrawalInitiated(subject, staker, deadline);

        _emitHook(abi.encodeWithSignature("hook_afterStakeChanged(address)", subject));

        return deadline;
    }

    /**
     * @dev Burn `sharesValue` shares for a given `subject`, and withdraw the corresponding tokens.
     *
     * Emits a ERC1155.TransferSingle event.
     */
    function withdraw(address subject) public returns (uint256) {
        address staker = _msgSender();

        require(!isFrozen(subject), "Subject unstaking is currently frozen");

        Timers.Timestamp storage timer = _lockingDelay[subject][staker];
        require(timer.isExpired(), 'Withdrawal is not ready');
        timer.reset();
        emit WithdrawalInitiated(subject, staker, 0);

        uint256 lockedShares = balanceOf(staker, _subjectToLocked(subject));
        uint256 stakeValue   = _lockedSharesToStake(subject, lockedShares);

        _lockedStakes.burn(subject, stakeValue);
        _burn(staker, _subjectToLocked(subject), lockedShares);
        SafeERC20.safeTransfer(stakedToken, staker, stakeValue);

        return stakeValue;
    }

    /**
     * @dev Slash a fraction of a subject stake, and transfer it to the treasury. Restricted to the `SLASHER_ROLE`.
     *
     * Emits a Slashed event.
     */
    function slash(address subject, uint256 stakeValue) public onlyRole(SLASHER_ROLE) returns (uint256) {
        uint256 slashFromActive = Math.min(stakeValue,                   _activeStakes.balanceOf(subject));
        uint256 slashFromLocked = Math.min(stakeValue - slashFromActive, _lockedStakes.balanceOf(subject));
        stakeValue = slashFromActive + slashFromLocked;

        _activeStakes.burn(subject, slashFromActive);
        _lockedStakes.burn(subject, slashFromLocked);
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
     * @dev Release owed to a given `subject` shareholder.
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

    function availableReward(address subject, address account) public view returns (uint256) {
        return SafeCast.toUint256(
            SafeCast.toInt256(_allocation(subject, balanceOf(account, _subjectToActive(subject))))
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
    function _historical(address subject) internal view returns (uint256) {
        return SafeCast.toUint256(SafeCast.toInt256(_rewards.balanceOf(subject)) + _released[subject].totalSupply());
    }

    function _allocation(address subject, uint256 amount) internal view returns (uint256) {
        uint256 supply = totalShares(subject);
        return amount > 0 && supply > 0 ? amount * _historical(subject) / supply : 0;
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

                // Rebalance released
                int256 virtualRelease = SafeCast.toInt256(_allocation(subject, amounts[i]));
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
    function _subjectToActive(address subject) private pure returns (uint256) { return uint256(uint160(subject));            }
    function _subjectToLocked(address subject) private pure returns (uint256) { return uint256(uint160(subject)) | 2 ** 160; }
    function _sharesToSubject(uint256 tokenId) private pure returns (address) { return address(uint160(tokenId));            }

    function _stakeToActiveShares(address subject, uint256 amount) internal view returns (uint256) {
        uint256 activeStake = _activeStakes.balanceOf(subject);
        return activeStake == 0 ? amount : amount * totalSupply(_subjectToActive(subject)) / activeStake;
    }

    function _stakeToLockedShares(address subject, uint256 amount) internal view returns (uint256) {
        uint256 lockedStake = _lockedStakes.balanceOf(subject);
        return lockedStake == 0 ? amount : amount * totalSupply(_subjectToLocked(subject)) / lockedStake;
    }

    function _activeSharesToStake(address subject, uint256 amount) internal view returns (uint256) {
        uint256 activeSupply = totalSupply(_subjectToActive(subject));
        return activeSupply == 0 ? 0 : amount * _activeStakes.balanceOf(subject) / activeSupply;
    }
    function _lockedSharesToStake(address subject, uint256 amount) internal view returns (uint256) {
        uint256 lockedSupply = totalSupply(_subjectToLocked(subject));
        return lockedSupply == 0 ? 0 : amount * _lockedStakes.balanceOf(subject) / lockedSupply;
    }

    // Admin: change withdrawal delay
    function setDelay(uint64 newDelay) public onlyRole(ADMIN_ROLE) {
        _withdrawalDelay = newDelay;
        emit DelaySet(newDelay);
    }

    // Admin: change recipient of slashed funds
    function setTreasury(address newTreasury) public onlyRole(ADMIN_ROLE) {
        _treasury = newTreasury;
        emit TreasurySet(newTreasury);
    }
}