// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

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

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __admin address to be the DEFAULT_ADMIN_ROLE.
     */
    function initialize(address __admin) external initializer {
        if (__admin == address(0)) revert ZeroAddress("__admin");
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, __admin);
    }

    /**
     * @notice Method for DEFAULT_ADMIN_ROLE to create new roles, and define their role admin.
     * @param role id of the new role. Should be keccak256("<ROLE_NAME>").
     * @param admin role id that will be the role admin for the new role.
     */
    function setNewRole(bytes32 role, bytes32 admin) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setRoleAdmin(role, admin);
    }

    /**
     * @notice Access control for the upgrade process (UPGRADER_ROLE)
     * @param newImplementation address of the new deployed implementation.
     */ 
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyRole(UPGRADER_ROLE) {
    }

    /**
     * @notice Allow ENS_MANAGER_ROLE to set ENS reverse registration
     * @param ensRegistry address
     * @param ensName the name to set in th registry
     */
    function setName(address ensRegistry, string calldata ensName) public onlyRole(ENS_MANAGER_ROLE) {
        ENSReverseRegistration.setName(ensRegistry, ensName);
    }

    /**
     * @notice Helper to get either msg msg.sender if not a meta transaction, signer of forwarder metatx if it is.
     * @inheritdoc ForwardedContext
     */
    function _msgSender() internal view virtual override(ContextUpgradeable, ForwardedContext) returns (address sender) {
        return super._msgSender();
    }

    /**
     * @notice Helper to get msg.data if not a meta transaction, forwarder data in metatx if it is.
     * @inheritdoc ForwardedContext
     */
    function _msgData() internal view virtual override(ContextUpgradeable, ForwardedContext) returns (bytes calldata) {
        return super._msgData();
    }

    uint256[50] private __gap;
}
