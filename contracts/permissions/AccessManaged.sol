// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/IAccessControl.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";

abstract contract AccessManaged is Context {
    IAccessControl public accessManager;

    error MissingRole(bytes32 role, address account);

    constructor(address manager) {
        accessManager = IAccessControl(manager);
    }

    modifier onlyRole(bytes32 role) {
        if (!accessManager.hasRole(role, _msgSender())) {
            revert MissingRole(role, _msgSender());
        }
        _;
    }
}

abstract contract AccessManagedUpgradeable is ContextUpgradeable {
    IAccessControl public accessManager;

    error MissingRole(bytes32 role, address account);

    function __AccessManaged_init(address manager) internal initializer {
        accessManager = IAccessControl(manager);
    }

    modifier onlyRole(bytes32 role) {
        if (!hasRole(role, _msgSender())) {
            revert MissingRole(role, _msgSender());
        }
        _;
    }

    function hasRole(bytes32 role, address account) internal view returns (bool) {
        return accessManager.hasRole(role, account);
    }
}
