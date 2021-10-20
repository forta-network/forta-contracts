// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

abstract contract AgentRegistryPermissioned {
    enum Permission {
      ADMIN,
      OWNER,
      DEVELOPER,
      length
    }
    function _hasPermission(uint256 agentId) internal virtual view returns (bool);
}