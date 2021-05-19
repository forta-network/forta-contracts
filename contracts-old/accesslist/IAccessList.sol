// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IAccessList {
    function isAuthorized(address,bytes4) external view returns (bool);
}
