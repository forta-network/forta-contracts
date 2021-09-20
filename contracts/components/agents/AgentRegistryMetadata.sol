// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./AgentRegistryCore.sol";

contract AgentRegistryMetadata is AgentRegistryCore {
    struct AgentMetadata {
        uint256 version;
        string metadata;
        uint256[] chainIds;
    }

    mapping(uint256 => AgentMetadata) private _agentMetadata;


    function getAgent(uint256 agentId) public view returns (AgentMetadata memory) {
        return _agentMetadata[agentId];
    }

    function _agentUpdate(uint256 agentId, string memory newMetadata, uint256[] calldata newChainIds) internal virtual override {
        super._agentUpdate(agentId, newMetadata, newChainIds);

        uint256 version = _agentMetadata[agentId].version + 1;
        _agentMetadata[agentId] = AgentMetadata({ version: version, metadata: newMetadata, chainIds: newChainIds });
    }
}
