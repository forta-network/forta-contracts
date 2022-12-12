// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./AgentRegistryMetadata.sol";

abstract contract AgentRegistryEnumerable is AgentRegistryMetadata {
    using EnumerableSet for EnumerableSet.UintSet;

    EnumerableSet.UintSet private _allAgents;
    mapping(uint256 => EnumerableSet.UintSet) private _chainAgents;

    /**
     * Agent count.
     * @dev Helper for external iteration.
     * @return total amount of registered agents.
     */
    function getAgentCount() public view returns (uint256) {
        return _allAgents.length();
    }

    /**
     * Agent id at index in _allAgents array.
     * @dev Helper for external iteration.
     * @param index of agent in _allAgents array.
     * @return agentId at index.
     */
    function getAgentByIndex(uint256 index) public view returns (uint256) {
        return _allAgents.at(index);
    }

    /**
     * Registered agent count by chainId.
     * @dev Helper for external iteration.
     * @param chainId.
     * @return agent total registered by chainId.
     */
    function getAgentCountByChain(uint256 chainId) public view returns (uint256) {
        return _chainAgents[chainId].length();
    }

    /**
     * Agent id at index, by chainId
     * @dev Helper for external iteration.
     * @param chainId where the agent was registered.
     * @param index of agent in _chainAgents[chainId] array.
     * @return agentId at index for that chainId.
     */
    function getAgentByChainAndIndex(uint256 chainId, uint256 index) public view returns (uint256) {
        return _chainAgents[chainId].at(index);
    }

    /**
     * @notice hook fired before agent creation or update.
     * @dev stores agent in _allAgents if it wasn't there, manages agent arrays by chain.
     * @param agentId ERC721 token id of the agent to be created or updated.
     * @param newMetadata IPFS pointer to agent's metadata JSON.
     * @param newChainIds ordered list of chainIds where the agent wants to run.
     */
    function _beforeAgentUpdate(uint256 agentId, string memory newMetadata, uint256[] calldata newChainIds) internal virtual override {
        super._beforeAgentUpdate(agentId, newMetadata, newChainIds);

        (,,uint256 version,, uint256[] memory oldChainIds) = getAgent(agentId);

        if (version == 0) { _allAgents.add(agentId); } //NOTE: ignoring EnumerableSet.add() bool output; We don't care if already added.

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
                i++;
                j++;
            }
        }
    }

    /**
     *  50
     * - 1 _allAgents;
     * - 1 _chainAgents;
     * --------------------------
     *  48 __gap
     */
    uint256[48] private __gap;
}
