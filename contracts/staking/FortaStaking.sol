// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Timers.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";
import "../tools/ENSReverseRegistration.sol";

import "./Distributions.sol";

contract FortaStaking is
    AccessControlUpgradeable,
    // MulticallUpgradeable,
    UUPSUpgradeable
{
    using Distributions for Distributions.Balances;
    using Distributions for Distributions.Splitter;
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
    Distributions.Balances private _pools;

    // distribution of subject shares, with integrated reward splitting
    mapping(address => Distributions.Splitter) private _shares;

    // release
    mapping(address => mapping(address => Release)) private _releases;
    uint64 private _delay;

    // treasure for slashing
    address private _treasure;


    // TODO: define events

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer
    {}

    function initialize(IERC20 __underlyingToken, uint64 __delay, address __treasure, address __admin) public initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
        _setRoleAdmin(SLASHER_ROLE, ADMIN_ROLE);
        _setupRole(ADMIN_ROLE, __admin);

        underlyingToken = __underlyingToken;
        _delay = __delay;
        _treasure = __treasure;
    }

    // Accessors
    function stakeOf(address subject) public view returns (uint256) {
        return _pools.balanceOf(subject);
    }

    function totalStake() public view returns (uint256) {
        return _pools.totalSupply();
    }

    function sharesOf(address subject, address account) public view returns (uint256) {
        return _shares[subject].balanceOf(account);
    }

    function totalShares(address subject) public view returns (uint256) {
        return _shares[subject].totalSupply();
    }

    // Token transfer (not sure if needed)
    function transfer(address subject, address to, uint256 value) public {
        address from = _msgSender();

        _transfer(subject, from, to, value);

        uint256 pendingRelease = _releases[subject][from].value;
        if (pendingRelease > 0) {
            uint256 currentShares = sharesOf(subject, from);
            if (currentShares < pendingRelease) {
                _releases[subject][from].value = currentShares;
            }
        }
    }

    // Stake related operations
    function stake(address subject, uint256 baseValue) public returns (uint256) {
        address staker = _msgSender();

        uint256 sharesValue = _shares[subject].totalSupply() == 0 ? baseValue : _baseToShares(subject, baseValue);
        _deposit(subject, staker, baseValue);
        _mint(subject, staker, sharesValue);
        return sharesValue;
    }

    function scheduleUnstake(address subject, uint256 sharesValue) public returns (uint64) {
        address staker = _msgSender();

        uint64 deadline = SafeCast.toUint64(block.timestamp) + _delay;
        uint256 value = Math.min(sharesValue, sharesOf(subject, staker));
        _releases[subject][staker].timestamp.setDeadline(deadline);
        _releases[subject][staker].value = value;
        return deadline;
    }

    function unstake(address subject, uint256 sharesValue) public returns (uint256) {
        address staker = _msgSender();

        if (_delay > 0) {
            require(_releases[subject][staker].timestamp.isExpired());
            _releases[subject][staker].value -= sharesValue; // schedule value is in shares, not in base tokens
        }

        uint baseValue = _sharestoBase(subject, sharesValue);
        _burn(subject, staker, sharesValue);
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
        _shares[subject].reward(value);
    }

    function release(address subject, address account) public returns (uint256) {
        uint256 value = _shares[subject].release(account);
        SafeERC20.safeTransfer(underlyingToken, account, value);
        return value;
    }

    function toRelease(address subject, address account) public view returns (uint256) {
        return _shares[subject].toRelease(account);
    }

    // Internal helpers
    function _deposit(address subject, address provider, uint256 value) internal {
        SafeERC20.safeTransferFrom(underlyingToken, provider, address(this), value);
        _pools.mint(subject, value);
    }

    function _withdraw(address subject, address to, uint256 value) internal {
        _pools.burn(subject, value);
        SafeERC20.safeTransfer(underlyingToken, to, value);
    }

    function _mint(address subject, address account, uint256 value) internal {
        _shares[subject].mint(account, value);
    }

    function _burn(address subject, address account, uint256 value) internal {
        _shares[subject].burn(account, value);
    }

    function _transfer(address subject, address from, address to, uint256 value) internal {
        _shares[subject].transfer(from, to, value);
    }

    function _baseToShares(address subject, uint256 amount) internal view returns (uint256) {
        return amount * _shares[subject].totalSupply() / _pools.balanceOf(subject);
    }

    function _sharestoBase(address subject, uint256 amount) internal view returns (uint256) {
        return amount * _pools.balanceOf(subject) / _shares[subject].totalSupply();
    }

    // Access control for the upgrade process
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyRole(ADMIN_ROLE) {
    }

    // Allow the upgrader to set ENS reverse registration
    function setName(address ensRegistry, string calldata ensName) public onlyRole(ADMIN_ROLE) {
        ENSReverseRegistration.setName(ensRegistry, ensName);
    }

    // Admin: change unstake delay
    function setDelay(uint64 newDelay) public onlyRole(ADMIN_ROLE) {
        _delay = newDelay;
    }

    // Admin: change recipient of slashed funds
    function setTreasure(address newTreasure) public onlyRole(ADMIN_ROLE) {
        _treasure = newTreasure;
    }
}