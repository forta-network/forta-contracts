// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
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

    struct Release {
        Timers.Timestamp timestamp; // ← underlying time is uint64
        uint256 value; // TODO: use uint192 to save gas ?
    }

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant SLASHER_ROLE = keccak256("SLASHER_ROLE");

    // underlyingToken
    IERC20 public underlyingToken;

    // distribution of underlyingToken between subjects (address)
    Distributions.Balances private _stakes;
    Distributions.Balances private _rewards;

    // distribution of subject shares, with integrated reward splitting
    mapping(address => Distributions.SignedBalances) private _released;

    // release commitment
    mapping(address => mapping(address => Release)) private _commits;

    // unstake delay
    uint64 private _delay;

    // treasure for slashing
    address private _treasure;


    // TODO: define events
    // - stake → TransferSingle from address(0)
    // - unstake → TransferSingle to address(0)
    // - slashing → erc20 movement without share burn → might need a local event
    // - scheduleUnstake
    // - reward
    // - release
    // - setDelay
    // - setTreasure


    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        address __manager,
        IERC20 __underlyingToken,
        uint64 __delay,
        address __treasure
    ) public initializer {
        __AccessManaged_init(__manager);
        __UUPSUpgradeable_init();

        underlyingToken = __underlyingToken;
        _delay = __delay;
        _treasure = __treasure;
    }

    // Accessors
    function stakeOf(address subject) public view returns (uint256) {
        return _stakes.balanceOf(subject);
    }

    function totalStake() public view returns (uint256) {
        return _stakes.totalSupply();
    }

    function sharesOf(address subject, address account) public view returns (uint256) {
        return balanceOf(account, uint256(uint160(subject)));
    }

    function totalShares(address subject) public view returns (uint256) {
        return totalSupply(uint256(uint160(subject)));
    }

    // Stake related operations
    function stake(address subject, uint256 baseValue) public returns (uint256) {
        address staker = _msgSender();

        uint256 sharesValue = totalSupply(uint256(uint160(subject))) == 0 ? baseValue : _baseToShares(subject, baseValue);
        _deposit(subject, staker, baseValue);
        _mint(staker, uint256(uint160(subject)), sharesValue, new bytes(0));
        return sharesValue;
    }

    function scheduleUnstake(address subject, uint256 sharesValue) public returns (uint64) {
        address staker = _msgSender();

        uint64 deadline = SafeCast.toUint64(block.timestamp) + _delay;
        uint256 value = Math.min(sharesValue, sharesOf(subject, staker));
        _commits[subject][staker].timestamp.setDeadline(deadline);
        _commits[subject][staker].value = value;
        return deadline;
    }

    function unstake(address subject, uint256 sharesValue) public returns (uint256) {
        address staker = _msgSender();

        if (_delay > 0) {
            require(_commits[subject][staker].timestamp.isExpired());
            _commits[subject][staker].value -= sharesValue; // schedule value is in shares, not in base tokens
        }

        uint baseValue = _sharestoBase(subject, sharesValue);
        _burn(staker, uint256(uint160(subject)), sharesValue);
        _withdraw(subject, staker, baseValue);
        return baseValue;
    }

    // function freeze
    // function unfreeze

    function slash(address subject, uint256 baseValue) public onlyRole(SLASHER_ROLE) {
        _withdraw(subject, _treasure, baseValue);
    }

    function reward(address subject, uint256 value) public {
        SafeERC20.safeTransferFrom(underlyingToken, _msgSender(), address(this), value);
        _rewards.mint(subject, value);
    }

    function release(address subject, address account) public returns (uint256) {
        uint256 value = toRelease(subject, account);

        _rewards.burn(subject, value);
        _released[subject].mint(account, SafeCast.toInt256(value));

        SafeERC20.safeTransfer(underlyingToken, account, value);
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
        SafeERC20.safeTransferFrom(underlyingToken, provider, address(this), value);
        _stakes.mint(subject, value);
    }

    function _withdraw(address subject, address to, uint256 value) internal {
        _stakes.burn(subject, value);
        SafeERC20.safeTransfer(underlyingToken, to, value);
    }

    function _baseToShares(address subject, uint256 amount) internal view returns (uint256) {
        return amount * totalSupply(uint256(uint160(subject))) / _stakes.balanceOf(subject);
    }

    function _sharestoBase(address subject, uint256 amount) internal view returns (uint256) {
        return amount * _stakes.balanceOf(subject) / totalSupply(uint256(uint160(subject)));
    }

    function _historical(address subject) private view returns (uint256) {
        return SafeCast.toUint256(SafeCast.toInt256(_rewards.balanceOf(subject)) + _released[subject].totalSupply());
    }

    function _allocation(address subject, uint256 amount) private view returns (uint256) {
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
            uint256 pendingRelease = _commits[subject][from].value;
            if (pendingRelease > 0) {
                uint256 currentShares = sharesOf(subject, from) - amounts[i];
                if (currentShares < pendingRelease) {
                    _commits[subject][from].value = currentShares;
                }
            }
        }
    }

    // Admin: change unstake delay
    function setDelay(uint64 newDelay) public onlyRole(ADMIN_ROLE) {
        _delay = newDelay;
    }

    // Admin: change recipient of slashed funds
    function setTreasure(address newTreasure) public onlyRole(ADMIN_ROLE) {
        _treasure = newTreasure;
    }

    // Access control for the upgrade process
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyRole(ADMIN_ROLE) {
    }

    // Allow the upgrader to set ENS reverse registration
    function setName(address ensRegistry, string calldata ensName) public onlyRole(ADMIN_ROLE) {
        ENSReverseRegistration.setName(ensRegistry, ensName);
    }
}