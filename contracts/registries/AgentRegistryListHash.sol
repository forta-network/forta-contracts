// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./AgentRegistryCore.sol";

contract AgentRegistryListHash is AgentRegistryCore {
    bytes32 _agentListHash;

    function getAgentListHash() public view returns (bytes32) {
        return _agentListHash;
    }

    function _beforeAgentUpdate(uint256 agentId, string memory newMetadata, uint256[] calldata newChainIds) internal virtual override {
        super._beforeAgentUpdate(agentId, newMetadata, newChainIds);

        AgentMetadata memory agent = getAgent(agentId);
        bytes32 oldHash = keccak256(abi.encodePacked(agentId, agent.metadata, agent.chainIds));
        bytes32 newHash = keccak256(abi.encodePacked(agentId, newMetadata, newChainIds));
        _agentListHash ^= oldHash ^ newHash;
    }

    function _beforeAgentEnable(uint256 agentId, Slot slot, bool enable) internal virtual override {
        super._beforeAgentEnable(agentId, slot, enable);

        uint256 disable = _getDisableFlags(agentId);
        bytes32 oldHash = keccak256(abi.encodePacked(agentId, disable));
        bytes32 newHash = keccak256(abi.encodePacked(agentId, disable ^ (1 << uint8(slot))));
        _agentListHash ^= oldHash ^ newHash;
    }
}
