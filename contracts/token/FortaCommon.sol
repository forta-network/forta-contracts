// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20VotesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../tools/ENSReverseRegistration.sol";
import "../errors/GeneralErrors.sol";
import "../components/utils/IVersioned.sol";

/**
 * Contract with the common functionality for both L1 FORT and L2 FortaBridgedPolygon.
 * NOTE: Whitelisting functionality, used before the token was public, is deprecated.
 * The whitelist was disabled setting whitelistDisabled = true, the current code keeps that storage
 * layout for compatibility and removes whitelist code from _beforeTokenTransfer() to save gas.
 * We are keeping the related roles to not break StakingEscrowFactory (already deployed), and the 
 * _setRoleAdmin() in the initializer for historical context.
 */
abstract contract FortaCommon is AccessControlUpgradeable, ERC20VotesUpgradeable, UUPSUpgradeable, IVersioned {
    bytes32 public constant ADMIN_ROLE       = keccak256("ADMIN_ROLE");
    bytes32 public constant WHITELISTER_ROLE = keccak256("WHITELISTER_ROLE");
    bytes32 public constant WHITELIST_ROLE   = keccak256("WHITELIST_ROLE");
    
    /// @custom:oz-renamed-from whitelistDisabled
    bool private deprecated_whitelistDisabled;
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @dev sets token name and symbol, permit init and RBAC structure.
     * @param admin address for the ADMIN_ROLE of the token.
     */
    function __FortaCommon_init(address admin) internal initializer {
        if (admin == address(0)) revert ZeroAddress("admin");
        __AccessControl_init();
        __ERC20_init("Forta", "FORT");
        __ERC20Permit_init("Forta");
        __UUPSUpgradeable_init();
        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
        _setRoleAdmin(WHITELISTER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(WHITELIST_ROLE, WHITELISTER_ROLE);
        _grantRole(ADMIN_ROLE, admin);
    }

    /// Access control for the upgrade process
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyRole(ADMIN_ROLE) {
    }

    // Allow the upgrader to set ENS reverse registration
    // NOTE: Forta token has a different role structure than contracts under component, by order of deployment.
    // instead of ENS_MANAGER_ROLE, here the token ADMIN has permission.
    function setName(address ensRegistry, string calldata ensName) external onlyRole(ADMIN_ROLE) {
        ENSReverseRegistration.setName(ensRegistry, ensName);
    }

    /**
     *  50
     * - 1 deprecated_whitelistDisabled
     * --------------------------
     *  49 __gap
     */
    uint256[49] private __gap; 
}
