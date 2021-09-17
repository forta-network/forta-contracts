// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/IAccessControl.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";

abstract contract AccessManaged is Context {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    IAccessControl private _accessManager;

    event AccessManagerUpdated(address indexed newAddressManager);
    error MissingRole(bytes32 role, address account);

    modifier onlyRole(bytes32 role) {
        if (!_accessManager.hasRole(role, _msgSender())) {
            revert MissingRole(role, _msgSender());
        }
        _;
    }

    constructor(address manager) {
        _accessManager = IAccessControl(manager);
        emit AccessManagerUpdated(manager);
    }

    function setAccessManager(address newManager) public onlyRole(ADMIN_ROLE) {
        _accessManager = IAccessControl(newManager);
        emit AccessManagerUpdated(newManager);
    }
}

abstract contract AccessManagedUpgradeable is ContextUpgradeable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    IAccessControl private _accessManager;

    event AccessManagerUpdated(address indexed newAddressManager);
    error MissingRole(bytes32 role, address account);

    modifier onlyRole(bytes32 role) {
        if (!_accessManager.hasRole(role, _msgSender())) {
            revert MissingRole(role, _msgSender());
        }
        _;
    }

    function __AccessManaged_init(address manager) internal initializer {
        _accessManager = IAccessControl(manager);
        emit AccessManagerUpdated(manager);
    }

    function setAccessManager(address newManager) public onlyRole(ADMIN_ROLE) {
        _accessManager = IAccessControl(newManager);
        emit AccessManagerUpdated(newManager);
    }
}
