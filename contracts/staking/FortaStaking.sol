// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
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
        uint256  _bounty;
    }

    function balanceOf(Splitter storage self, address account) internal view returns (uint256) {
        return balanceOf(self._shares, account);
    }

    function totalSupply(Splitter storage self) internal view returns (uint256) {
        return totalSupply(self._shares);
    }

    function mint(Splitter storage self, address account, uint256 amount) internal {
        if (totalSupply(self._shares) > 0) {
            int256 virtualRelease = SafeCast.toInt256(_virtualRelease(self, amount));
            mint(self._released, account, virtualRelease);
        }

        mint(self._shares, account, amount);
    }

    function burn(Splitter storage self, address account, uint256 amount) internal {
        int256 virtualRelease = SafeCast.toInt256(_virtualRelease(self, amount));
        burn(self._released, account, virtualRelease);

        burn(self._shares, account, amount);
    }

    function transfer(Splitter storage self, address from, address to, uint256 amount) internal {
        int256 virtualRelease = SafeCast.toInt256(_virtualRelease(self, amount));
        burn(self._released, from, virtualRelease);
        mint(self._released, to, virtualRelease);

        transfer(self._shares, from, to, amount);
    }

    function toRelease(Splitter storage self, address account) internal view returns (uint256) {
        uint256 shares = balanceOf(self._shares, account);
        return shares == 0
            ? 0
            : uint256(int256(shares) * (int256(self._bounty) + totalSupply(self._released)) / int256(totalSupply(self._shares)) - balanceOf(self._released, account));
    }

    function release(Splitter storage self, address account) internal returns (uint256) {
        uint256 pending = toRelease(self, account);
        self._bounty -= pending;
        mint(self._released, account, int256(pending));
        return pending;
    }

    function reward(Splitter storage self, uint256 amount) internal {
        self._bounty += amount;
    }

    function _historical(Splitter storage self) private view returns (uint256) {
        return SafeCast.toUint256(SafeCast.toInt256(self._bounty) + totalSupply(self._released));
    }

    function _virtualRelease(Splitter storage self, uint256 amount) private view returns (uint256) {
        return amount * _historical(self) / totalSupply(self._shares);
    }
}






contract FortaStaking is
    AccessControlUpgradeable,
    // MulticallUpgradeable,
    UUPSUpgradeable
{
    using Distributions for Distributions.Balances;
    using Distributions for Distributions.Splitter;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // underlyingToken
    IERC20 public underlyingToken;

    // distribution of underlyingToken between subjects (address)
    Distributions.Balances private _pools;

    // distribution of subject shares, with integrated reward splitting
    mapping(address => Distributions.Splitter) private _shares;

    // TODO: define events


    function initialize(IERC20 _underlyingToken, address admin) public initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
        _setupRole(ADMIN_ROLE, admin);

        underlyingToken = _underlyingToken;
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
        _transfer(subject, _msgSender(), to, value);
    }

    // Stake related operations
    function stake(address subject, uint256 baseValue) public returns (uint256) {
        uint256 sharesValue = _shares[subject].totalSupply() == 0 ? baseValue : _baseToShares(subject, baseValue);
        _deposit(subject, _msgSender(), baseValue);
        _mint(subject, _msgSender(), sharesValue);
        return sharesValue;
    }

    function unstake(address subject, uint256 sharesValue) public returns (uint256) {
        // TODO: force delay
        address staker = _msgSender();

        uint baseValue = _sharestoBase(subject, sharesValue);
        _burn(subject, staker, sharesValue);
        _withdraw(subject, staker, baseValue);
        return baseValue;
    }

    function seize(address subject, uint256 baseValue) public onlyRole(ADMIN_ROLE) {
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
    function setName(address ensRegistry, string calldata ensName) external onlyRole(ADMIN_ROLE) {
        ENSReverseRegistration.setName(ensRegistry, ensName);
    }
}