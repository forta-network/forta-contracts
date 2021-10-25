// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./AgentRegistryMetadata.sol";

abstract contract AgentRegistryEnumerable is AgentRegistryMetadata {
    using EnumerableSet for EnumerableSet.UintSet;

    EnumerableSet.UintSet private _allAgents;
    mapping(uint256 => EnumerableSet.UintSet) private _chainAgents;

    function getAgentCount() public view returns (uint256) {
        return _allAgents.length();
    }

    function getAgentByIndex(uint256 index) public view returns (uint256) {
        return _allAgents.at(index);
    }

    function getAgentCountByChain(uint256 chainId) public view returns (uint256) {
        return _chainAgents[chainId].length();
    }

    function getAgentByChainAndIndex(uint256 chainId, uint256 index) public view returns (uint256) {
        return _chainAgents[chainId].at(index);
    }

    function _beforeAgentUpdate(uint256 agentId, string memory newMetadata, uint256[] calldata newChainIds) internal virtual override {
        super._beforeAgentUpdate(agentId, newMetadata, newChainIds);

        (uint256 version,, uint256[] memory oldChainIds) = getAgent(agentId);

        if (version == 0) { _allAgents.add(agentId); }

        uint256 i = 0;
        uint256 j = 0;
        while (i < oldChainIds.length || j < newChainIds.length) {
            if (i == oldChainIds.length) { // no more old chains, just add the remaining new chains
                _chainAgents[newChainIds[j++]].add(agentId);
            } else if (j == newChainIds.length) { // no more new chain, just remove the remaining old chains
                _chainAgents[oldChainIds[i++]].remove(agentId);
            } else if (oldChainIds[i] < newChainIds[j]) { // old chain smaller, remove if
                _chainAgents[oldChainIds[i++]].remove(agentId);
            } else if (oldChainIds[i] > newChainIds[j]) { // new chain smaller, add it
                _chainAgents[newChainIds[j++]].add(agentId);
            } else { // chainIds are the same do nothing
                ++i;
                ++j;
            }
        }
    }

    uint256[48] private __gap;
}
