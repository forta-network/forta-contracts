// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/BitMaps.sol";

import "./AgentRegistryCore.sol";
import "../utils/StakeAware.sol";

abstract contract AgentRegistryEnable is AgentRegistryCore, StakeAwareUpgradeable {
    using BitMaps for BitMaps.BitMap;

    enum Permission {
        ADMIN,
        OWNER,
        length
    }

    mapping(uint256 => BitMaps.BitMap) private _disabled;

    event AgentEnabled(uint256 indexed agentId, bool indexed enabled, Permission permission, bool value);

    /**
     * Check if agent is enabled
     * @param agentId token Id
     * @return true if the agent exist and has not been disabled and is staked over minimum
     * Returns false if otherwise
     */
    function isEnabled(uint256 agentId) public view virtual returns (bool) {
        return isCreated(agentId) &&
            _getDisableFlags(agentId) == 0 &&
            _isStakedOverMin(AGENT_SUBJECT, agentId); 
    }

    function enableAgent(uint256 agentId, Permission permission) public virtual {
        require(_isStakedOverMin(AGENT_SUBJECT, agentId), "AgentRegistryEnable: agent staked under minimum");
        require(_hasPermission(agentId, permission), "AgentRegistryEnable: invalid permission");
        _enable(agentId, permission, true);
    }

    function disableAgent(uint256 agentId, Permission permission) public virtual {
        require(_hasPermission(agentId, permission), "AgentRegistryEnable: invalid permission");
        _enable(agentId, permission, false);
    }

    function _hasPermission(uint256 agentId, Permission permission) internal view returns (bool) {
        if (permission == Permission.ADMIN) { return hasRole(AGENT_ADMIN_ROLE, _msgSender()); }
        if (permission == Permission.OWNER) { return _msgSender() == ownerOf(agentId); }
        return false;
    }

    function _enable(uint256 agentId, Permission permission, bool enable) internal {
        _beforeAgentEnable(agentId, permission, enable);
        _agentEnable(agentId, permission, enable);
        _afterAgentEnable(agentId, permission, enable);
    }

    /**
     * Get the disabled flags for an agentId. Permission (uint8) is used for indexing, so we don't
     * need to loop. 
     * If not disabled, all flags will be 0
     */
    function _getDisableFlags(uint256 agentId) internal view returns (uint256) {
        return _disabled[agentId]._data[0];
    }

    /**
     * Hook: Agent is enabled/disabled
     */
    function _beforeAgentEnable(uint256 agentId, Permission permission, bool value) internal virtual {
    }

    function _agentEnable(uint256 agentId, Permission permission, bool value) internal virtual {
        _disabled[agentId].setTo(uint8(permission), !value);
        emit AgentEnabled(agentId, isEnabled(agentId), permission, value);
    }

    function _afterAgentEnable(uint256 agentId, Permission permission, bool value) internal virtual {
        _emitHook(abi.encodeWithSignature("hook_afterAgentEnable(uint256)", agentId));
    }
    
    function _msgSender() internal view virtual override(ContextUpgradeable, AgentRegistryCore) returns (address sender) {
        return super._msgSender();
    }

    function _msgData() internal view virtual override(ContextUpgradeable, AgentRegistryCore) returns (bytes calldata) {
        return super._msgData();
    }

    uint256[49] private __gap;
}
