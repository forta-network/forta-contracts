// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20VotesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../tools/ENSReverseRegistration.sol";

contract FortaCommon is AccessControlUpgradeable, ERC20VotesUpgradeable, UUPSUpgradeable {
    bytes32 public constant ADMIN_ROLE       = keccak256("ADMIN_ROLE");
    bytes32 public constant WHITELISTER_ROLE = keccak256("WHITELISTER_ROLE");
    bytes32 public constant WHITELIST_ROLE   = keccak256("WHITELIST_ROLE");

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function __FortaCommon_init(address admin) internal initializer {
        require(admin != address(0), "FortaCommon: admin cannot be address 0");
        __AccessControl_init();
        __ERC20_init("Forta", "FORT");
        __ERC20Permit_init("Forta");
        __UUPSUpgradeable_init();
        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
        _setRoleAdmin(WHITELISTER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(WHITELIST_ROLE, WHITELISTER_ROLE);
        _setupRole(ADMIN_ROLE, admin);
    }

    // Allow whitelister to assign other whitelisters
    function grantWhitelister(address to) public onlyRole(WHITELISTER_ROLE) {
        _grantRole(WHITELISTER_ROLE, to);
    }

    // Only allow transfer to whitelisted accounts
    function _beforeTokenTransfer(address from, address to, uint256 amount) internal virtual override {
        require(from == address(0) || hasRole(WHITELIST_ROLE, from), "Forta: sender is not whitelisted");
        require(to   == address(0) || hasRole(WHITELIST_ROLE, to), "Forta: receiver is not whitelisted");
        super._beforeTokenTransfer(from, to, amount);
    }

    // Access control for the upgrade process
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyRole(ADMIN_ROLE) {
    }

    // Allow the upgrader to set ENS reverse registration
    function setName(address ensRegistry, string calldata ensName) external onlyRole(ADMIN_ROLE) {
        ENSReverseRegistration.setName(ensRegistry, ensName);
    }
}
