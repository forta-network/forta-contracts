// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/Multicall.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../Roles.sol";
import "../utils/ForwardedContext.sol";
import "../utils/IVersioned.sol";
import "../../tools/ENSReverseRegistration.sol";
import "../../errors/GeneralErrors.sol";

// This cannot be BaseComponentUpgradeable, because BaseComponentUpgradeable is AccessManagedUpgradeable
contract AccessManager is ForwardedContext, AccessControlUpgradeable, UUPSUpgradeable, Multicall, IVersioned {
    
    string public constant version = "0.1.0";

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    function initialize(address __admin) external initializer {
        if (__admin == address(0)) revert ZeroAddress("__admin");
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, __admin);
    }

    function setNewRole(bytes32 role, bytes32 admin) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setRoleAdmin(role, admin);
    }

    // Access control for the upgrade process
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyRole(UPGRADER_ROLE) {
    }

    // Allow the upgrader to set ENS reverse registration
    function setName(address ensRegistry, string calldata ensName) public onlyRole(ENS_MANAGER_ROLE) {
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
