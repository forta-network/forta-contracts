// SPDX-License-Identifier: UNLICENSED
// See Forta Business Source License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.4;

interface IVersioned {
    function version() external returns(string memory v);
}