// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Multicall.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "../BaseComponent.sol";

// This cannot be BaseComponent, because BaseComponent is AccessManagedUpgradeable
contract AccessManager is AccessControlUpgradeable, UUPSUpgradeable, Multicall {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(address admin) external initializer {
        __AccessControl_init();
        _setupRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function setNewRole(bytes32 role, bytes32 admin) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setRoleAdmin(role, admin);
    }

    // Access control for the upgrade process
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyRole(DEFAULT_ADMIN_ROLE) {
    }

    // Allow the upgrader to set ENS reverse registration
    function setName(address ensRegistry, string calldata ensName) public onlyRole(DEFAULT_ADMIN_ROLE) {
        ENSReverseRegistration.setName(ensRegistry, ensName);
    }
}
