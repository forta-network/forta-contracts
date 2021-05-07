// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract Fortify is AccessControlUpgradeable, ERC20PermitUpgradeable, UUPSUpgradeable {
    bytes32 public constant UPGRADER_ROLE    = keccak256("UPGRADER_ROLE");
    bytes32 public constant MINTER_ROLE      = keccak256("MINTER_ROLE");
    bytes32 public constant WHITELISTER_ROLE = keccak256("WHITELISTER_ROLE");
    bytes32 public constant WHITELIST_ROLE   = keccak256("WHITELIST_ROLE");

    function initialize() public initializer {
        __ERC20_init("Fortify", "FORT");
        __ERC20Permit_init("Fortify");
        _setRoleAdmin(UPGRADER_ROLE,    UPGRADER_ROLE);
        _setRoleAdmin(MINTER_ROLE,      UPGRADER_ROLE);
        _setRoleAdmin(WHITELISTER_ROLE, UPGRADER_ROLE);
        _setRoleAdmin(WHITELIST_ROLE,   WHITELISTER_ROLE);
        _setupRole(UPGRADER_ROLE, msg.sender);
        _setupRole(WHITELISTER_ROLE, address(this)); // required by spreadWhitelist
    }

    // Allow minters to mint new tokens
    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    // Allow whitelisted users to spread the whitelist
    function spreadWhitelist(address to) public onlyRole(WHITELIST_ROLE) {
        this.grantRole(WHITELIST_ROLE, to);
    }

    // Only allow transfer to whitelisted accounts
    function _beforeTokenTransfer(address from, address to, uint256 amount)
    internal virtual override
    {
        require(hasRole(WHITELIST_ROLE, to));
        super._beforeTokenTransfer(from, to, amount);
    }

    // Access control for the upgrade process
    function _authorizeUpgrade(address newImplementation)
    internal virtual override onlyRole(UPGRADER_ROLE)
    {
    }
}
