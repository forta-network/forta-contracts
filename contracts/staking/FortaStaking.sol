// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/utils/Timers.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";

import "../permissions/AccessManaged.sol";
import "../tools/Distributions.sol";
import "../tools/ENSReverseRegistration.sol";

contract FortaStaking is
    AccessManagedUpgradeable,
    ERC1155SupplyUpgradeable,
    // MulticallUpgradeable,
    UUPSUpgradeable
{
    using Distributions for Distributions.Balances;
    using Distributions for Distributions.SignedBalances;
    using Timers        for Timers.Timestamp;

    struct WithdrawalSchedule {
        Timers.Timestamp timestamp; // ← underlying time is uint64
        uint256 value; // TODO: use uint192 to save gas ?
    }

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant SLASHER_ROLE = keccak256("SLASHER_ROLE");

    IERC20 public stakedToken;

    // distribution of baseToken between subjects (address)
    Distributions.Balances private _stakes;
    Distributions.Balances private _rewards;

    // distribution of subject shares, with integrated reward splitting
    mapping(address => Distributions.SignedBalances) private _released;

    // frozen tokens
    mapping(address => bool) private _frozen;

    // WithdrawalSchedule, in share token
    mapping(address => mapping(address => WithdrawalSchedule)) private _withdrawalSchedules;

    // withdrawal delay
    uint64 private _delay;

    // treasury for slashing
    address private _treasury;

    event WithdrawalSheduled(address indexed subject, address indexed account, uint256 value);
    event Freeze(address indexed subject, bool isFrozen);
    event Slash(address indexed subject, address indexed by, uint256 value);
    event Reward(address indexed subject, address indexed from, uint256 value);
    event Release(address indexed subject, address indexed to, uint256 value);
    event DelaySet(uint256 newDelay);
    event TreasurySet(address newTreasury);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        address __manager,
        IERC20 __stakedToken,
        uint64 __delay,
        address __treasury
    ) public initializer {
        __AccessManaged_init(__manager);
        __UUPSUpgradeable_init();

        stakedToken = __stakedToken;
        _delay = __delay;
        _treasury = __treasury;
        emit DelaySet(__delay);
        emit TreasurySet(__treasury);
    }

    /**
     * @dev Get stake of a subject
     */
    function stakeOf(address subject) public view returns (uint256) {
        return _stakes.balanceOf(subject);
    }

    /**
     * @dev Get total stake of all subjects
     */
    function totalStake() public view returns (uint256) {
        return _stakes.totalSupply();
    }

    /**
     * @dev Get shares of an account on a subject, corresponding to a fraction of the subject stake.
     */
    function sharesOf(address subject, address account) public view returns (uint256) {
        return balanceOf(account, uint256(uint160(subject)));
    }

    /**
     * @dev Get the total shares on a subject.
     */
    function totalShares(address subject) public view returns (uint256) {
        return totalSupply(uint256(uint160(subject)));
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

        uint256 sharesValue = totalSupply(uint256(uint160(subject))) == 0 ? stakeValue : _stakeToShares(subject, stakeValue);
        _deposit(subject, staker, stakeValue);
        _mint(staker, uint256(uint160(subject)), sharesValue, new bytes(0));
        return sharesValue;
    }

    /**
     * @dev Schedule the withdrawal of shares.
     *
     * Emits a WithdrawalSheduled event.
     */
    function scheduleWithdrawal(address subject, uint256 sharesValue) public returns (uint64) {
        address staker = _msgSender();

        uint64 deadline = SafeCast.toUint64(block.timestamp) + _delay;
        uint256 value = Math.min(sharesValue, sharesOf(subject, staker));
        _withdrawalSchedules[subject][staker].timestamp.setDeadline(deadline);
        _withdrawalSchedules[subject][staker].value = value;

        emit WithdrawalSheduled(subject, staker, sharesValue);

        return deadline;
    }

    /**
     * @dev Burn `sharesValue` shares for a given `subject, and withdraw the corresponding tokens.
     *
     * Emits a ERC1155.TransferSingle event.
     */
    function withdraw(address subject, uint256 sharesValue) public returns (uint256) {
        address staker = _msgSender();

        require(!isFrozen(subject), "Subject unstaking is currently frozen");

        if (_delay > 0) {
            WithdrawalSchedule storage pendingRelease = _withdrawalSchedules[subject][staker];

            require(pendingRelease.timestamp.isExpired());
            pendingRelease.value -= sharesValue;

            emit WithdrawalSheduled(subject, staker, pendingRelease.value);
        }

        uint256 stakeValue = _sharesToStake(subject, sharesValue);
        _burn(staker, uint256(uint160(subject)), sharesValue);
        _withdraw(subject, staker, stakeValue);
        return stakeValue;
    }

    /**
     * @dev Freeze/unfreeze a subject stake. Restricted to the `SLASHER_ROLE`.
     *
     * Emits a Freeze event.
     */
    function freeze(address subject, bool frozen) public onlyRole(SLASHER_ROLE) {
        _frozen[subject] = frozen;
        emit Freeze(subject, frozen);
    }

    /**
     * @dev Slash a fraction of a subject stake, and transfer it to the treasury. Restricted to the `SLASHER_ROLE`.
     *
     * Emits a Slashed event.
     */
    function slash(address subject, uint256 stakeValue) public onlyRole(SLASHER_ROLE) {
        _withdraw(subject, _treasury, stakeValue);
        emit Slash(subject, _msgSender(), stakeValue);
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

        emit Reward(subject, _msgSender(), value);
    }

    /**
     * @dev Release owed to a given `subject` shareholder.
     *
     * Emits a Release event.
     */
    function release(address subject, address account) public returns (uint256) {
        uint256 value = toRelease(subject, account);

        _rewards.burn(subject, value);
        _released[subject].mint(account, SafeCast.toInt256(value));

        SafeERC20.safeTransfer(stakedToken, account, value);

        emit Release(subject, account, value);

        return value;
    }

    function toRelease(address subject, address account) public view returns (uint256) {
        return SafeCast.toUint256(
            SafeCast.toInt256(_allocation(subject, balanceOf(account, uint256(uint160(subject)))))
            -
            _released[subject].balanceOf( account)
        );
    }

    // Internal helpers
    function _deposit(address subject, address provider, uint256 value) internal {
        SafeERC20.safeTransferFrom(stakedToken, provider, address(this), value);
        _stakes.mint(subject, value);
    }

    function _withdraw(address subject, address to, uint256 value) internal {
        _stakes.burn(subject, value);
        SafeERC20.safeTransfer(stakedToken, to, value);
    }

    function _stakeToShares(address subject, uint256 amount) internal view returns (uint256) {
        return amount * totalSupply(uint256(uint160(subject))) / _stakes.balanceOf(subject);
    }

    function _sharesToStake(address subject, uint256 amount) internal view returns (uint256) {
        return amount * _stakes.balanceOf(subject) / totalSupply(uint256(uint160(subject)));
    }

    function _historical(address subject) internal view returns (uint256) {
        return SafeCast.toUint256(SafeCast.toInt256(_rewards.balanceOf(subject)) + _released[subject].totalSupply());
    }

    function _allocation(address subject, uint256 amount) internal view returns (uint256) {
        uint256 supply = totalSupply(uint256(uint160(subject)));
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
            address subject = address(uint160(ids[i]));

            // Rebalance released
            int256 virtualRelease = SafeCast.toInt256(_allocation(subject, amounts[i]));
            if (from != address(0)) {
                _released[subject].burn(from, virtualRelease);
            }
            if (to != address(0)) {
                _released[subject].mint(to, virtualRelease);
            }

            // Cap commit to current balance
            WithdrawalSchedule storage pendingRelease = _withdrawalSchedules[subject][from];
            if (pendingRelease.value > 0) {
                uint256 currentShares = sharesOf(subject, from) - amounts[i];
                if (currentShares < pendingRelease.value) {
                    pendingRelease.value = currentShares;
                    emit WithdrawalSheduled(subject, from, currentShares);
                }
            }
        }
    }

    // Admin: change withdrawal delay
    function setDelay(uint64 newDelay) public onlyRole(ADMIN_ROLE) {
        _delay = newDelay;
        emit DelaySet(newDelay);
    }

    // Admin: change recipient of slashed funds
    function setTreasury(address newTreasury) public onlyRole(ADMIN_ROLE) {
        _treasury = newTreasury;
        emit TreasurySet(newTreasury);
    }

    // Access control for the upgrade process
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyRole(ADMIN_ROLE) {
    }

    // Allow the upgrader to set ENS reverse registration
    function setName(address ensRegistry, string calldata ensName) public onlyRole(ADMIN_ROLE) {
        ENSReverseRegistration.setName(ensRegistry, ensName);
    }
}