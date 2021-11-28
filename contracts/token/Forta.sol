// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./FortaCommon.sol";

contract Forta is FortaCommon {
    bytes32 public constant MINTER_ROLE      = keccak256("MINTER_ROLE");

    function initialize(address admin) public initializer {
        __FortaCommon_init(admin);

        _setRoleAdmin(MINTER_ROLE, ADMIN_ROLE);
    }

    // Allow minters to mint new tokens
    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }
}
