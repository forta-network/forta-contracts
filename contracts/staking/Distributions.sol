// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeCast.sol";

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
        mint(self._released, account, SafeCast.toInt256(_allocation(self, amount)));
        mint(self._shares, account, amount);
    }

    function burn(Splitter storage self, address account, uint256 amount) internal {
        burn(self._released, account, SafeCast.toInt256(_allocation(self, amount)));
        burn(self._shares, account, amount);
    }

    function transfer(Splitter storage self, address from, address to, uint256 amount) internal {
        int256 virtualRelease = SafeCast.toInt256(_allocation(self, amount));
        burn(self._released, from, virtualRelease);
        mint(self._released, to, virtualRelease);
        transfer(self._shares, from, to, amount);
    }

    function toRelease(Splitter storage self, address account) internal view returns (uint256) {
        return SafeCast.toUint256(
            SafeCast.toInt256(_allocation(self, balanceOf(self._shares, account)))
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

    function _allocation(Splitter storage self, uint256 amount) private view returns (uint256) {
        uint256 supply = totalSupply(self._shares);
        return amount > 0 && supply > 0 ? amount * _historical(self) / supply : 0;
    }
}
