// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./AgentRegistryEnable.sol";
import "../utils/MinStakeAware.sol";
/*
abstract contract AgentRegistryMinStakeAware is AgentRegistryEnable, MinStakeAwareUpgradeable {

    /**
     * Check if agent is enabled
     * @param agentId token Id
     * @return true if the agent exist, has not been disabled, and is staked over minimum value.
     * Returns false if otherwise
     */
     /*
    function isEnabled(uint256 agentId) public view virtual override returns (bool) {
        return super.isEnabled(agentId) && _isStakedOverMin(AGENT_SUBJECT, agentId); 
    }

    function enableAgent(uint256 agentId, Permission permission) override public virtual {
        require(_isStakedOverMin(AGENT_SUBJECT, agentId), "AgentRegistryEnable: agent staked under minimum");
        super.enableAgent(agentId, permission);
    }

    function _msgSender() internal view virtual override(ContextUpgradeable, AgentRegistryCore) returns (address sender) {
        return super._msgSender();
    }

    function _msgData() internal view virtual override(ContextUpgradeable, AgentRegistryCore) returns (bytes calldata) {
        return super._msgData();
    }


    uint256[50] private __gap;
}
*/