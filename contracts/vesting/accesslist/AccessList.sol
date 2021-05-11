// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./IAccessList.sol";

contract AccessList is IAccessList, OwnableUpgradeable {
    mapping (address => mapping (bytes4 => bool)) private _authorized;

    function initialize() external initializer {
        __Ownable_init();
    }

    function isAuthorized(address target, bytes4 selector) public view virtual override returns (bool) {
        return getAuthorization(target, selector) || getAuthorization(address(0), selector);
    }

    function getAuthorization(address target, bytes4 selector) public view virtual returns (bool) {
        return _authorized[target][selector];
    }

    function getAuthorization(address target, bytes4 selector, bool value) public virtual onlyOwner() returns (bool) {
        return _authorized[target][selector] = value;
    }
}
