// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

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
}
