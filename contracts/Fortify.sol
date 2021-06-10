// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/contracts/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/contracts/token/ERC20/extensions/ERC20VotesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/contracts/proxy/utils/UUPSUpgradeable.sol";
import "./tools/ENSReverseRegistration.sol";
import "./IFortify.sol";

contract Fortify is IFortify, AccessControlUpgradeable, ERC20VotesUpgradeable, UUPSUpgradeable {
    bytes32 public constant ADMIN_ROLE       = keccak256("ADMIN_ROLE");
    bytes32 public constant MINTER_ROLE      = keccak256("MINTER_ROLE");
    bytes32 public constant WHITELISTER_ROLE = keccak256("WHITELISTER_ROLE");
    bytes32 public constant WHITELIST_ROLE   = keccak256("WHITELIST_ROLE");

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IERC20Upgradeable).interfaceId
            || interfaceId == type(IERC20MetadataUpgradeable).interfaceId
            || interfaceId == type(IERC20PermitUpgradeable).interfaceId
            || interfaceId == type(ERC20VotesUpgradeable).interfaceId
            || super.supportsInterface(interfaceId);
    }

    function initialize(address admin) public initializer {
        __AccessControl_init();
        __ERC20_init("Fortify", "FORT");
        __ERC20Permit_init("Fortify");
        __UUPSUpgradeable_init();
        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
        _setRoleAdmin(MINTER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(WHITELISTER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(WHITELIST_ROLE, WHITELISTER_ROLE);
        _setupRole(ADMIN_ROLE, admin);
        _setupRole(ADMIN_ROLE, address(this)); // required by grantWhitelister
    }

    // Allow minters to mint new tokens
    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    // Allow whitelister to assign other whitelisters
    function grantWhitelister(address to) public onlyRole(WHITELISTER_ROLE) {
        this.grantRole(WHITELISTER_ROLE, to);
    }

    // Only allow transfer to whitelisted accounts
    function _beforeTokenTransfer(address from, address to, uint256 amount) internal virtual override {
        require(hasRole(WHITELIST_ROLE, to), "Fortify: receiver is not whitelisted");
        super._beforeTokenTransfer(from, to, amount);
    }

    // Access control for the upgrade process
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyRole(ADMIN_ROLE) {
    }

    // Allow the upgrader to set ENS reverse registration
    function setName(address ensregistry, string calldata ensname) external onlyRole(ADMIN_ROLE) {
        ENSReverseRegistration.setName(ensregistry, ensname);
    }
}
