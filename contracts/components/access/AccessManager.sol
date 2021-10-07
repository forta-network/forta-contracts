// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Multicall.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../Roles.sol";
import "../utils/ForwardedContext.sol";
import "../../tools/ENSReverseRegistration.sol";

// This cannot be BaseComponent, because BaseComponent is AccessManagedUpgradeable
contract AccessManager is ForwardedContext, AccessControlUpgradeable, UUPSUpgradeable, Multicall {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    function initialize(address __admin) external initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _setupRole(DEFAULT_ADMIN_ROLE, __admin);
    }

    function setNewRole(bytes32 role, bytes32 admin) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setRoleAdmin(role, admin);
    }

    // Access control for the upgrade process
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyRole(UPGRADER_ROLE) {
    }

    // Allow the upgrader to set ENS reverse registration
    function setName(address ensRegistry, string calldata ensName) public onlyRole(DEFAULT_ADMIN_ROLE) {
        ENSReverseRegistration.setName(ensRegistry, ensName);
    }

    function _msgSender() internal view virtual override(ContextUpgradeable, ForwardedContext) returns (address sender) {
        return super._msgSender();
    }

    function _msgData() internal view virtual override(ContextUpgradeable, ForwardedContext) returns (bytes calldata) {
        return super._msgData();
    }

    uint256[50] private __gap;
}
