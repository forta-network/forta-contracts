// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

abstract contract AgentRegistryPermissioned {
    enum Permission {
        ADMIN,
        OWNER,
        DEVELOPER,
        length
    }
    function _hasEnablingPermission(uint256 agentId, Permission permission) internal virtual view returns (bool) {
        return false;
    }

    function _hasUpdatingPermission(uint256 agentId, Permission permission) internal virtual view returns (bool) {
        return false;
    }
}