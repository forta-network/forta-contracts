// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/IAccessControl.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165CheckerUpgradeable.sol";
import "../Roles.sol";

abstract contract AccessManagedUpgradeable is ContextUpgradeable {

    using ERC165CheckerUpgradeable for address;

    IAccessControl private _accessControl;

    event AccessManagerUpdated(address indexed newAddressManager);
    error MissingRole(bytes32 role, address account);

    modifier onlyRole(bytes32 role) {
        if (!hasRole(role, _msgSender())) {
            revert MissingRole(role, _msgSender());
        }
        _;
    }

    function __AccessManaged_init(address manager) internal initializer {
        require(manager.supportsInterface(type(IAccessControl).interfaceId), "AccessManaged: manager must be IAccessControl");
        _accessControl = IAccessControl(manager);
        emit AccessManagerUpdated(manager);
    }

    function hasRole(bytes32 role, address account) internal view returns (bool) {
        return _accessControl.hasRole(role, account);
    }

    function setAccessManager(address newManager) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newManager.supportsInterface(type(IAccessControl).interfaceId), "AccessManaged: newManager must be IAccessControl");
        _accessControl = IAccessControl(newManager);
        emit AccessManagerUpdated(newManager);
    }

    uint256[49] private __gap;
}
