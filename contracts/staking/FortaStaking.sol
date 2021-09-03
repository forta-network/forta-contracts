// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/utils/Timers.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";
import "../tools/ENSReverseRegistration.sol";




library Distributions {
    struct Balances {
        mapping(address => uint256) _balances;
        uint256 _totalSupply;
    }

    function balanceOf(Balances storage self, address account) internal view returns (uint256) {
        return self._balances[account];
    }

    function totalSupply(Balances storage self) internal view returns (uint256) {
        return self._totalSupply;
    }

    function mint(Balances storage self, address account, uint256 amount) internal {
        require(account != address(0), "mint to the zero address");
        self._balances[account] += amount;
        self._totalSupply += amount;
    }

    function burn(Balances storage self, address account, uint256 amount) internal {
        require(account != address(0), "burn from the zero address");
        self._balances[account] -= amount;
        self._totalSupply -= amount;
    }

    function transfer(Balances storage self, address from, address to, uint256 amount) internal {
        require(from != address(0), "transfer from the zero address");
        require(to != address(0), "transfer to the zero address");
        self._balances[from] -= amount;
        self._balances[to] += amount;
    }


    struct SignedBalances {
        mapping(address => int256) _balances;
        int256 _totalSupply;
    }

    function balanceOf(SignedBalances storage self, address account) internal view returns (int256) {
        return self._balances[account];
    }

    function totalSupply(SignedBalances storage self) internal view returns (int256) {
        return self._totalSupply;
    }

    function mint(SignedBalances storage self, address account, int256 amount) internal {
        require(account != address(0), "mint to the zero address");
        self._balances[account] += amount;
        self._totalSupply += amount;
    }

    function burn(SignedBalances storage self, address account, int256 amount) internal {
        require(account != address(0), "burn from the zero address");
        self._balances[account] -= amount;
        self._totalSupply -= amount;
    }

    function transfer(SignedBalances storage self, address from, address to, int256 amount) internal {
        require(from != address(0), "transfer from the zero address");
        require(to != address(0), "transfer to the zero address");
        self._balances[from] -= amount;
        self._balances[to] += amount;
    }


    struct Splitter {
        Balances _shares;
        SignedBalances _released;
        uint256 _bounty;
    }

    function balanceOf(Splitter storage self, address account) internal view returns (uint256) {
        return balanceOf(self._shares, account);
    }

    function totalSupply(Splitter storage self) internal view returns (uint256) {
        return totalSupply(self._shares);
    }

    function mint(Splitter storage self, address account, uint256 amount) internal {
        mint(self._released, account, SafeCast.toInt256(_vested(self, amount)));
        mint(self._shares, account, amount);
    }

    function burn(Splitter storage self, address account, uint256 amount) internal {
        burn(self._released, account, SafeCast.toInt256(_vested(self, amount)));
        burn(self._shares, account, amount);
    }

    function transfer(Splitter storage self, address from, address to, uint256 amount) internal {
        int256 virtualRelease = SafeCast.toInt256(_vested(self, amount));
        burn(self._released, from, virtualRelease);
        mint(self._released, to, virtualRelease);
        transfer(self._shares, from, to, amount);
    }

    function toRelease(Splitter storage self, address account) internal view returns (uint256) {
        return SafeCast.toUint256(
            SafeCast.toInt256(_vested(self, balanceOf(self._shares, account)))
            -
            balanceOf(self._released, account)
        );
    }

    function release(Splitter storage self, address account) internal returns (uint256) {
        uint256 pending = toRelease(self, account);
        self._bounty -= pending;
        mint(self._released, account, SafeCast.toInt256(pending));
        return pending;
    }

    function reward(Splitter storage self, uint256 amount) internal {
        self._bounty += amount;
    }

    function _historical(Splitter storage self) private view returns (uint256) {
        return SafeCast.toUint256(SafeCast.toInt256(self._bounty) + totalSupply(self._released));
    }

    function _vested(Splitter storage self, uint256 amount) private view returns (uint256) {
        uint256 supply = totalSupply(self._shares);
        return supply > 0 ? amount * _historical(self) / supply : 0;
    }
}






contract FortaStaking is
    AccessControlUpgradeable,
    // MulticallUpgradeable,
    UUPSUpgradeable
{
    using Distributions for Distributions.Balances;
    using Distributions for Distributions.Splitter;
    using Timers for Timers.Timestamp;

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


    // TODO: define events


    function initialize(IERC20 __underlyingToken, uint64 __delay, address __admin) public initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
        _setRoleAdmin(SLASHER_ROLE, ADMIN_ROLE);
        _setupRole(ADMIN_ROLE, __admin);

        underlyingToken = __underlyingToken;
        _delay = __delay;
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

    function slash(address subject, uint256 baseValue) public onlyRole(SLASHER_ROLE) {
        _withdraw(subject, _msgSender(), baseValue); // when value is seized, where do tokens go ?
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
        return amount * _shares[subject].totalSupply() / _pools.totalSupply();
    }

    function _sharestoBase(address subject, uint256 amount) internal view returns (uint256) {
        return amount * _pools.totalSupply() / _shares[subject].totalSupply();
    }

    // Access control for the upgrade process
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyRole(ADMIN_ROLE) {
    }

    // Allow the upgrader to set ENS reverse registration
    function setName(address ensRegistry, string calldata ensName) public onlyRole(ADMIN_ROLE) {
        ENSReverseRegistration.setName(ensRegistry, ensName);
    }

    function setDelay(uint64 newDelay) public onlyRole(ADMIN_ROLE) {
        _delay = newDelay;
    }
}