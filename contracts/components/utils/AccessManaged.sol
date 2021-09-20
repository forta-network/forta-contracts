// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/IAccessControl.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";

abstract contract AccessManagedUpgradeable is ContextUpgradeable {
    bytes32 public constant DEFAULT_ADMIN_ROLE = bytes32(0);

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

    function setAccessManager(address newManager) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _accessManager = IAccessControl(newManager);
        emit AccessManagerUpdated(newManager);
    }
}
