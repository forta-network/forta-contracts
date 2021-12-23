// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library Distributions {
    struct Balances {
        mapping(uint256 => uint256) _balances;
        uint256 _totalSupply;
    }

    function balanceOf(Balances storage self, uint256 subjectId) internal view returns (uint256) {
        return self._balances[subjectId];
    }

    function totalSupply(Balances storage self) internal view returns (uint256) {
        return self._totalSupply;
    }

    function mint(Balances storage self, uint256 subjectId, uint256 amount) internal {
        self._balances[subjectId] += amount;
        self._totalSupply += amount;
    }

    function burn(Balances storage self, uint256 subjectId, uint256 amount) internal {
        self._balances[subjectId] -= amount;
        self._totalSupply -= amount;
    }

    function transfer(Balances storage self, uint256 from, uint256 to, uint256 amount) internal {
        self._balances[from] -= amount;
        self._balances[to] += amount;
    }

    struct SignedBalances {
        mapping(uint256 => int256) _balances;
        int256 _totalSupply;
    }

    function balanceOf(SignedBalances storage self, uint256 subjectId) internal view returns (int256) {
        return self._balances[subjectId];
    }

    function totalSupply(SignedBalances storage self) internal view returns (int256) {
        return self._totalSupply;
    }

    function mint(SignedBalances storage self, uint256 subjectId, int256 amount) internal {
        self._balances[subjectId] += amount;
        self._totalSupply += amount;
    }

    function burn(SignedBalances storage self, uint256 subjectId, int256 amount) internal {
        self._balances[subjectId] -= amount;
        self._totalSupply -= amount;
    }

    function transfer(SignedBalances storage self, uint256 from, uint256 to, int256 amount) internal {
        self._balances[from] -= amount;
        self._balances[to] += amount;
    }
}
