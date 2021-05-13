// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/contracts/access/OwnableUpgradeable.sol";
import "./IAccessList.sol";

contract AccessList is IAccessList, OwnableUpgradeable {
    mapping (address => mapping (bytes4 => bool)) private _authorized;

    function initialize() external initializer {
        __Ownable_init();
    }

    function isAuthorized(address target, bytes4 selector) public view virtual override returns (bool) {
        return getAccess(target, selector) || getAccess(address(0), selector);
    }

    function getAccess(address target, bytes4 selector) public view virtual returns (bool) {
        return _authorized[target][selector];
    }

    function setAccess(address target, bytes4 selector, bool value) public virtual onlyOwner() returns (bool) {
        return _authorized[target][selector] = value;
    }
}
