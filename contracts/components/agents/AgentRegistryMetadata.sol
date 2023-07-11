// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "./AgentRegistryCore.sol";

abstract contract AgentRegistryMetadata is AgentRegistryCore {
    struct AgentMetadata {
        uint256 version;
        string metadata;
        uint256[] chainIds;
        uint8 redundancy;
        uint8 shards;
    }

    mapping(uint256 => AgentMetadata) private _agentMetadata;
    mapping(bytes32 => bool) private _agentMetadataUniqueness;

    error MetadataNotUnique(bytes32 hash);

    /**
     * @notice Gets agent metadata, version, chain Ids, redundancy, and shards.
     * @param agentId ERC721 token id of the agent.
     * @return owner address.
     * @return agentVersion of the agent.
     * @return metadata IPFS pointer.
     * @return chainIds the agent wants to run in.
     * @return redundancy level of redundancy for the agent.
     * @return shards amounts of shards for the agent.
     */
    function getAgent(uint256 agentId)
        public view
        returns (address owner, uint256 agentVersion, string memory metadata, uint256[] memory chainIds, uint8 redundancy, uint8 shards)
    {
        bool exists = _exists(agentId);
        AgentMetadata memory _agentData = _agentMetadata[agentId];
        return (
            exists ? ownerOf(agentId) : address(0),
            _agentData.version,
            _agentData.metadata,
            _agentData.chainIds,
            _agentData.redundancy,
            _agentData.shards
        );
    }

    /**
     * @notice logic for agent update.
     * @dev checks metadata uniqueness and updates agent metadata, version,
     * chain Ids, redundancy, and shards.
     * @param agentId ERC721 token id of the agent to be created or updated.
     * @param newMetadata IPFS pointer to agent's metadata JSON.
     * @param newChainIds ordered list of chainIds where the agent wants to run.
     * @param newRedundancy level of redundancy for the agent.
     * @param newShards amounts of shards for the agent.
     */
    function _agentUpdate(uint256 agentId, string memory newMetadata, uint256[] calldata newChainIds, uint8 newRedundancy, uint8 newShards) internal virtual override {
        super._agentUpdate(agentId, newMetadata, newChainIds, newRedundancy, newShards);

        AgentMetadata memory _agentData = _agentMetadata[agentId];
        bytes32 oldHash = keccak256(bytes(_agentData.metadata));
        bytes32 newHash = keccak256(bytes(newMetadata));
        if (_agentMetadataUniqueness[newHash]) revert MetadataNotUnique(newHash);
        _agentMetadataUniqueness[newHash] = true;
        _agentMetadataUniqueness[oldHash] = false;

        uint256 version = _agentData.version + 1;
        _agentMetadata[agentId] = AgentMetadata({ version: version, metadata: newMetadata, chainIds: newChainIds, redundancy: newRedundancy, shards: newShards });
    }

    /**
     *  50
     * - 1 _agentMetadata;
     * - 1 _agentMetadataUniqueness;
     * --------------------------
     *  48 __gap
     */
    uint256[48] private __gap;
}
