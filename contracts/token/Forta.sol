// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./FortaCommon.sol";

/**
 * This version of the Forta token is living on the root (or parent) chain. That would be:
 * - Mainnet for production
 * - Goerli for testing
 *
 * In addition to all the common forta features, the version is mintable by a specific role.
 */
contract Forta is FortaCommon {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    function initialize(address admin) public initializer {
        __FortaCommon_init(admin);
        _setRoleAdmin(MINTER_ROLE, ADMIN_ROLE);
    }

    // Allow minters to mint new tokens
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    uint256[50] private __gap; 
}
