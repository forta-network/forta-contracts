// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/BitMaps.sol";

import "./AgentRegistryCore.sol";

contract AgentRegistryEnable is AgentRegistryCore {
    using BitMaps for BitMaps.BitMap;

    enum Permission {
        ADMIN,
        OWNER,
        length
    }

    mapping(uint256 => BitMaps.BitMap) private _disabled;

    event AgentEnabled(uint256 indexed agentId, Permission permission, bool enabled);

    /**
     * @dev Enable/Disable agent
     */
    function isEnabled(uint256 agentId) public view virtual returns (bool) {
        return _disabled[agentId]._data[0] == 0; // Permission.length < 256 → we don't have to loop
    }

    function enableAgent(uint256 agentId, Permission permission) public virtual {
        require(permission < Permission.length, "invalid permission slot");
        if (permission == Permission.ADMIN) { require(hasRole(AGENT_ADMIN_ROLE, _msgSender())); }
        if (permission == Permission.OWNER) { require(_msgSender() == ownerOf(agentId)); }
        _enable(agentId, permission, true);
    }

    function disableAgent(uint256 agentId, Permission permission) public virtual {
        require(permission < Permission.length, "invalid permission slot");
        if (permission == Permission.ADMIN) { require(hasRole(AGENT_ADMIN_ROLE, _msgSender())); }
        if (permission == Permission.OWNER) { require(_msgSender() == ownerOf(agentId)); }
        _enable(agentId, permission, false);
    }

    function _enable(uint256 agentId, Permission permission, bool enable) internal {
        _beforeAgentEnable(agentId, permission, enable);
        _agentEnable(agentId, permission, enable);
        _afterAgentEnable(agentId, permission, enable);
    }

    function _getDisableFlags(uint256 agentId) internal view returns (uint256) {
        return _disabled[agentId]._data[0];
    }

    /**
     * Hook: Agent is enabled/disabled
     */
    function _beforeAgentEnable(uint256 agentId, Permission permission, bool enable) internal virtual {
    }

    function _agentEnable(uint256 agentId, Permission permission, bool enable) internal virtual {
        _disabled[agentId].setTo(uint8(permission), !enable);
        emit AgentEnabled(agentId, permission, enable);
    }

    function _afterAgentEnable(uint256 agentId, Permission permission, bool enable) internal virtual {
        _emitHook(abi.encodeWithSignature("hook_afterAgentEnable(uint256)", agentId));
    }

    uint256[49] private __gap;
}
