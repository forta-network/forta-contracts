// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../errors/GeneralErrors.sol";

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
        if (account == address(0)) revert ZeroAddress("mint");
        self._balances[account] += amount;
        self._totalSupply += amount;
    }

    function burn(SignedBalances storage self, address account, int256 amount) internal {
        if(account == address(0)) revert ZeroAddress("burn");
        self._balances[account] -= amount;
        self._totalSupply -= amount;
    }

    function transfer(SignedBalances storage self, address from, address to, int256 amount) internal {
        if (from == address(0)) revert ZeroAddress("from");
        if (to == address(0)) revert ZeroAddress("to");
        self._balances[from] -= amount;
        self._balances[to] += amount;
    }
}
