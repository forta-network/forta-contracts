// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/interfaces/draft-IERC2612.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/utils/Timers.sol";
import "@openzeppelin/contracts/utils/Multicall.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "../permissions/AccessManaged.sol";
import "../tools/Distributions.sol";
import "../tools/ENSReverseRegistration.sol";

contract FortaStaking is
    AccessManagedUpgradeable,
    ERC1155SupplyUpgradeable,
    Multicall,
    UUPSUpgradeable
{
    using Distributions for Distributions.Balances;
    using Distributions for Distributions.SignedBalances;
    using Timers        for Timers.Timestamp;

    struct WithdrawalSchedule {
        Timers.Timestamp timer; // ← underlying time is uint64
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
    uint64 private _withdrawalDelay;

    // treasury for slashing
    address private _treasury;

    event WithdrawalSheduled(address indexed subject, address indexed account, uint256 shares, uint64 deadline);
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
        IERC20 __stakedToken,
        uint64 __withdrawalDelay,
        address __treasury
    ) public initializer {
        __AccessManaged_init(__manager);
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
     *
     * NOTE: This is equivalent to getting the ERC1155 balance of `account` with `subject` casted to a uint256 tokenId.
     */
    function sharesOf(address subject, address account) public view returns (uint256) {
        return balanceOf(account, _subjectToTokenId(subject));
    }

    /**
     * @dev Get the total shares on a subject.
     *
     * NOTE: This is equivalent to getting the ERC1155 totalSupply for `subject` casted to a uint256 tokenId.
     */
    function totalShares(address subject) public view returns (uint256) {
        return totalSupply(_subjectToTokenId(subject));
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

        uint256 sharesValue = totalShares(subject) == 0 ? stakeValue : _stakeToShares(subject, stakeValue);
        _deposit(subject, staker, stakeValue);
        _mint(staker, _subjectToTokenId(subject), sharesValue, new bytes(0));
        return sharesValue;
    }

    /**
     * @dev Schedule the withdrawal of shares.
     *
     * Emits a WithdrawalSheduled event.
     */
    function scheduleWithdrawal(address subject, uint256 sharesValue) public returns (uint64) {
        address staker = _msgSender();

        uint64 deadline = SafeCast.toUint64(block.timestamp) + _withdrawalDelay;
        uint256 value   = Math.min(sharesValue, sharesOf(subject, staker));

        _withdrawalSchedules[subject][staker].timer.setDeadline(deadline);
        _withdrawalSchedules[subject][staker].value = value;

        emit WithdrawalSheduled(subject, staker, value, deadline);

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

        WithdrawalSchedule storage pendingWithdrawal = _withdrawalSchedules[subject][staker];

        require(pendingWithdrawal.timer.isExpired(), 'Withdrawal is not ready');
        uint256 sharesValue = pendingWithdrawal.value;
        delete pendingWithdrawal.timer;
        delete pendingWithdrawal.value;

        emit WithdrawalSheduled(subject, staker, 0, 0);

        uint256 stakeValue = _sharesToStake(subject, sharesValue);
        _burn(staker, _subjectToTokenId(subject), sharesValue);
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
        emit Froze(subject, _msgSender(), frozen);
    }

    /**
     * @dev Slash a fraction of a subject stake, and transfer it to the treasury. Restricted to the `SLASHER_ROLE`.
     *
     * Emits a Slashed event.
     */
    function slash(address subject, uint256 stakeValue) public onlyRole(SLASHER_ROLE) {
        _withdraw(subject, _treasury, stakeValue);
        emit Slashed(subject, _msgSender(), stakeValue);
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
            SafeCast.toInt256(_allocation(subject, balanceOf(account, _subjectToTokenId(subject))))
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
    function _deposit(address subject, address provider, uint256 value) internal {
        SafeERC20.safeTransferFrom(stakedToken, provider, address(this), value);
        _stakes.mint(subject, value);
    }

    function _withdraw(address subject, address to, uint256 value) internal {
        _stakes.burn(subject, value);
        SafeERC20.safeTransfer(stakedToken, to, value);
    }

    function _stakeToShares(address subject, uint256 amount) internal view returns (uint256) {
        return amount * totalShares(subject) / _stakes.balanceOf(subject);
    }

    function _sharesToStake(address subject, uint256 amount) internal view returns (uint256) {
        return amount * _stakes.balanceOf(subject) / totalShares(subject);
    }

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
            address subject = _tokenIdToSubject(ids[i]);

            // Rebalance released
            int256 virtualRelease = SafeCast.toInt256(_allocation(subject, amounts[i]));
            if (from != address(0) && to != address(0)) {
                _released[subject].transfer(from, to, virtualRelease);
            } else if (from != address(0)) {
                _released[subject].burn(from, virtualRelease);
            } else if (to != address(0)) {
                _released[subject].mint(to, virtualRelease);
            }

            // Cap commit to current balance
            WithdrawalSchedule storage pendingWithdrawal = _withdrawalSchedules[subject][from];
            if (pendingWithdrawal.value > 0) {
                uint256 currentShares = sharesOf(subject, from) - amounts[i];
                if (currentShares < pendingWithdrawal.value) {
                    pendingWithdrawal.value = currentShares;
                    emit WithdrawalSheduled(subject, from, currentShares, pendingWithdrawal.timer.getDeadline());
                }
            }
        }
    }

    function _subjectToTokenId(address subject) private pure returns (uint256) { return uint256(uint160(subject)); }
    function _tokenIdToSubject(uint256 tokenId) private pure returns (address) { return address(uint160(tokenId)); }

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

    // Access control for the upgrade process
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyRole(ADMIN_ROLE) {
    }

    // Allow the upgrader to set ENS reverse registration
    function setName(address ensRegistry, string calldata ensName) public onlyRole(ADMIN_ROLE) {
        ENSReverseRegistration.setName(ensRegistry, ensName);
    }
}