// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IVersioned {
    function version() external returns(string memory v);
}