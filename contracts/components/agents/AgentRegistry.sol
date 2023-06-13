// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../BaseComponentUpgradeable.sol";

import "./AgentRegistryCore.sol";
import "./AgentRegistryEnable.sol";
import "./AgentRegistryEnumerable.sol";
import "./AgentRegistryMetadata.sol";
import "./AgentRegistryMembership.sol";

contract AgentRegistry is
    BaseComponentUpgradeable,
    AgentRegistryCore,
    AgentRegistryMetadata,
    AgentRegistryEnumerable,
    AgentRegistryMembership,
    AgentRegistryEnable
{
    string public constant version = "0.1.6";
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder)
    initializer
    ForwardedContext(forwarder) {}

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     * @param __name ERC721 token name.
     * @param __symbol ERC721 token symbol.
     */
    function initialize(
        address __manager,
        string calldata __name,
        string calldata __symbol,
        address __individualLock,
        address __teamLock,
        address __botUnits,
        uint256 __executionFeesStartTime
    ) public initializer {
        __BaseComponentUpgradeable_init(__manager);
        __ERC721_init(__name, __symbol);
        __AgentRegistryMembership_init(__individualLock, __teamLock, __botUnits, __executionFeesStartTime);
    }

    /**
     * @notice Gets all Agent state.
     * @param agentId ERC721 token id of the agent.
     * @return agentVersion of the agent.
     * @return metadata IPFS pointer.
     * @return chainIds the agent wants to run in.
     * @return redundancy level of redundancy for the agent.
     * @return shards amounts of shards for the agent.
     * @return enabled true if staked over min and not disabled.
     * @return disabledFlags 0 if not disabled, Permission that disabled the scnner otherwise.
     */
    function getAgentState(uint256 agentId)
        public view
        returns (
            uint256 agentVersion,
            string memory metadata,
            uint256[] memory chainIds,
            uint8 redundancy,
            uint8 shards,
            bool enabled,
            uint256 disabledFlags
        ) {
        (, agentVersion, metadata, chainIds, redundancy, shards) = getAgent(agentId);
        return (
            agentVersion,
            metadata,
            chainIds,
            redundancy,
            shards,
            isEnabled(agentId),
            getDisableFlags(agentId)
        );
    }

    /**
     * @notice Hook fired in the process of modifiying an agent
     * (creating, updating, etc.).
     * Will check if certain requirements are met.
     * @param account Owner of the specific agent.
     * @param agentId ERC721 token id of the agent to be created or updated.
     * @param amount Amount of agent units the given agent will need.
     */
    function _agentUnitsRequirementCheck(
        address account,
        uint256 agentId,
        uint256 amount
    ) internal virtual override(AgentRegistryCore, AgentRegistryMembership, AgentRegistryEnable) returns(bool) {
        return super._agentUnitsRequirementCheck(account, agentId, amount);
    }

    /**
     * @notice Inheritance disambiguation for hook fired befire agent update (and creation).
     * @param agentId id of the agent.
     * @param newMetadata IPFS pointer to agent's metadata
     * @param newChainIds chain ids that the agent wants to scan
     */
    function _beforeAgentUpdate(
        uint256 agentId,
        string memory newMetadata,
        uint256[] calldata newChainIds
    ) internal virtual override(AgentRegistryCore, AgentRegistryEnumerable) {
        super._beforeAgentUpdate(agentId, newMetadata, newChainIds);
    }

    /**
     * @notice Obligatory inheritance disambiguation for hook fired for agent update (and creation).
     * @param agentId id of the agent.
     * @param newMetadata IPFS pointer to agent's metadata
     * @param newChainIds chain ids that the agent wants to scan
     */
    function _agentUpdate(
        uint256 agentId,
        string memory newMetadata,
        uint256[] calldata newChainIds,
        uint8 newRedundancy,
        uint8 newShards
    ) internal virtual override(AgentRegistryCore, AgentRegistryMetadata, AgentRegistryMembership, AgentRegistryEnable) {
        super._agentUpdate(agentId, newMetadata, newChainIds, newRedundancy, newShards);
    }

    /**
     * @notice Obligatory inheritance disambiguation for hook fired for agent update (and creation).
     * @param agentId id of the agent.
     * @param newMetadata IPFS pointer to agent's metadata
     * @param newChainIds chain ids that the agent wants to scan
     */
    function _afterAgentUpdate(
        uint256 agentId,
        string memory newMetadata,
        uint256[] calldata newChainIds
    ) internal virtual override(AgentRegistryCore, AgentRegistryMembership, AgentRegistryEnable) {
        super._afterAgentUpdate(agentId,newMetadata,newChainIds);
    }

    /**
     * @notice Hook fired in the process of modifiying an agent
     * (creating, updating, etc.).
     * Will update the agent owner's balance of active agent units.
     * @param account Owner of the specific agent.
     * @param agentId ERC721 token id of the agent to be created or updated.
     * @param agentUnits Amount of agent units the given agent will need.
     * @param agentMod The type of modification to be done to the agent.
     */
    function _agentUnitsUpdate(address account, uint256 agentId, uint256 agentUnits, AgentModification agentMod) internal virtual override(AgentRegistryCore, AgentRegistryMembership, AgentRegistryEnable) {
        super._agentUnitsUpdate(account, agentId, agentUnits, agentMod);
    }

    /**
     * @notice Helper to get either msg msg.sender if not a meta transaction, signer of forwarder metatx if it is.
     * @inheritdoc ForwardedContext
     */
    function _msgSender() internal view virtual override(BaseComponentUpgradeable, AgentRegistryCore, AgentRegistryEnable) returns (address sender) {
        return super._msgSender();
    }

    /**
     * @notice Helper to get msg.data if not a meta transaction, forwarder data in metatx if it is.
     * @inheritdoc ForwardedContext
     */
    function _msgData() internal view virtual override(BaseComponentUpgradeable, AgentRegistryCore, AgentRegistryEnable) returns (bytes calldata) {
        return super._msgData();
    }

    uint256[50] private __gap;
}
