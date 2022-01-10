// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

abstract contract AgentRegistryPermissioned {
    enum Permission {
        ADMIN,
        OWNER,
        length
    }
    function _hasPermission(uint256 agentId, Permission permission) internal virtual view returns (bool) {
        return false;
    }

}