// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract AccessManager is AccessControlUpgradeable, UUPSUpgradeable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(address admin) external initializer {
        __AccessControl_init();
        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
        _setupRole(ADMIN_ROLE, admin);
    }

    function setNewRole(bytes32 role, bytes32 admin) external onlyRole(ADMIN_ROLE) {
        // TODO: do we want this check, they make assignment definitive
        require(getRoleAdmin(admin) != bytes32(0)); // admin exists
        require(getRoleAdmin(role)  == bytes32(0)); // role doesnt exist
        _setRoleAdmin(role, admin);
    }

    // Access control for the upgrade process
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyRole(ADMIN_ROLE) {
    }
}
