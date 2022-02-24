// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/BitMaps.sol";
import "./AgentRegistryCore.sol";
import "../staking/StakeSubject.sol";

/**
* @dev AgentRegistry methods and state handling disabling and enabling agents, and
* recognizing stake changes that might disable an agent.
* NOTE: This contract was deployed before StakeAwareUpgradeable was created, so __StakeAwareUpgradeable_init
* is not called.
*/
abstract contract AgentRegistryEnable is AgentRegistryCore, StakeSubjectUpgradeable {
    using BitMaps for BitMaps.BitMap;

    enum Permission {
        ADMIN,
        OWNER,
        length
    }

    mapping(uint256 => BitMaps.BitMap) private _disabled;
    StakeThreshold private _stakeThreshold;
    
    event AgentEnabled(uint256 indexed agentId, bool indexed enabled, Permission permission, bool value);
    event StakeThresholdChanged(uint256 min, uint256 max);

    /**
     * Check if agent is enabled
     * @param agentId token Id
     * @return true if the agent exist and has not been disabled and is staked over minimum
     * Returns false if otherwise
     */
    function isEnabled(uint256 agentId) public view virtual returns (bool) {
        return isCreated(agentId) &&
            _getDisableFlags(agentId) == 0 &&
            _isStakedOverMin(agentId); 
    }

    function enableAgent(uint256 agentId, Permission permission) public virtual {
        require(_isStakedOverMin(agentId), "AgentRegistryEnable: agent staked under minimum");
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
        _emitHook(abi.encodeWithSignature("hook_afterAgentEnable(uint256,uint8,bool)", agentId, uint8(permission), value));
    }

    /**
     * Stake
     */
    function setStakeThreshold(StakeThreshold memory newStakeThreshold) external onlyRole(AGENT_ADMIN_ROLE) {
        require(newStakeThreshold.max > newStakeThreshold.min, "AgentRegistryEnable: StakeThreshold max <= min");
        _stakeThreshold = newStakeThreshold;
        emit StakeThresholdChanged(newStakeThreshold.min, newStakeThreshold.max);
    }

    /**
     @dev stake threshold common for all agents
    */
    function getStakeThreshold(uint256 /*subject*/) public override view returns (StakeThreshold memory) {
        return _stakeThreshold;
    }

    /**
     * Checks if agent is staked over minimium stake
     * @param subject agentId
     * @return true if agent is staked over the minimum threshold, or staking is not yet enabled (stakeController = 0).
     * false otherwise
     */
    function _isStakedOverMin(uint256 subject) internal override view returns(bool) {
        if (address(getStakeController()) == address(0)) {
            return true;
        }
        return getStakeController().activeStakeFor(AGENT_SUBJECT, subject) >= _stakeThreshold.min;
    }
    
    /**
     * Override
     */
    function _msgSender() internal view virtual override(ContextUpgradeable, AgentRegistryCore) returns (address sender) {
        return super._msgSender();
    }

    function _msgData() internal view virtual override(ContextUpgradeable, AgentRegistryCore) returns (bytes calldata) {
        return super._msgData();
    }

    uint256[47] private __gap;
}
