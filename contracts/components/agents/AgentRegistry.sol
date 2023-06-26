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
    AgentRegistryEnable,
    AgentRegistryMetadata,
    AgentRegistryEnumerable,
    AgentRegistryMembership
{
    string public constant version = "0.1.7";
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
        string calldata __symbol
    ) public initializer {
        __BaseComponentUpgradeable_init(__manager);
        __ERC721_init(__name, __symbol);
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
    function _agentBypassesAgentUnitsRequirement(
        address account,
        uint256 agentId,
        uint256 amount
    ) internal virtual override(AgentRegistryCore, AgentRegistryMembership) returns(bool) {
        return super._agentBypassesAgentUnitsRequirement(account, agentId, amount);
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
    ) internal virtual override(AgentRegistryCore, AgentRegistryMetadata) {
        super._agentUpdate(agentId, newMetadata, newChainIds, newRedundancy, newShards);
    }

    /**
     * @notice Internal methods for enabling the agent.
     * @dev fires hook _before and _after enable within the inheritance tree.
     * @param agentId ERC721 token id of the agent.
     * @param permission the sender claims to have to enable the agent.
     * @param enable true if enabling, false if disabling.
     */
    function _enable(uint256 agentId, Permission permission, bool enable) internal virtual override {
        super._enable(agentId,permission,enable);

        // Fetching agent owner since admin role
        // can also enable and disable an agent
        address agentOwner = super.ownerOf(agentId);
        (,,,uint256[] memory chainIds, uint8 redundancy, uint8 shards) = super.getAgent(agentId);
        uint256 _agentUnits = calculateAgentUnitsNeeded(chainIds.length, redundancy, shards);
        bool _canBypassNeededAgentUnits = _agentBypassesAgentUnitsRequirement(agentOwner, agentId, _agentUnits);
        AgentModification agentMod = enable == true ? AgentModification.Enable : AgentModification.Disable;
        if (!_canBypassNeededAgentUnits) { _activeAgentUnitsBalanceUpdate(agentOwner, agentId, _agentUnits, agentMod); }
        _beforeAgentEnable(agentId, permission, enable);
        _agentEnable(agentId, permission, enable);
        _afterAgentEnable(agentId, permission, enable);
    }

    /**
     * @notice Fetch the amount of active agent units a given agent uses/requires.
     * @param agentId ERC721 token id of given agent.
     * @return Amount of agent units the given agent uses/requires
     */
    function existingAgentActiveUnitUsage(uint256 agentId) public view virtual override returns (uint256) {
        (,,,uint256[] memory chainIds, uint8 redundancy, uint8 shards) = super.getAgent(agentId);
        return super.calculateAgentUnitsNeeded(chainIds.length, redundancy, shards);
    }

    /**
     * @notice hook fired before agent creation or update.
     * @dev does nothing in this contract.
     * @param agentId ERC721 token id of the agent to be created or updated.
     * @param newMetadata IPFS pointer to agent's metadata JSON.
     * @param newChainIds ordered list of chainIds where the agent wants to run.
     * @param newRedundancy Level of redundancy for the agent.
     * @param newShards Amount of shards for the the agent.
     */
    function _beforeAgentUpdate(uint256 agentId, string memory newMetadata, uint256[] calldata newChainIds, uint8 newRedundancy, uint8 newShards) internal virtual override(AgentRegistryCore, AgentRegistryEnumerable) {
        super._beforeAgentUpdate(agentId,newMetadata,newChainIds,newRedundancy,newShards);
    }

    /**
     * @notice hook fired after agent creation or update.
     * @dev emits Router hook.
     * @param agentId ERC721 token id of the agent to be created or updated.
     * @param newMetadata IPFS pointer to agent's metadata JSON.
     * @param newChainIds ordered list of chainIds where the agent wants to run.
     * @param newRedundancy level of redundancy for the agent.
     * @param newShards amounts of shards for the agent.
     */
    function _afterAgentUpdate(uint256 agentId, string memory newMetadata, uint256[] calldata newChainIds, uint8 newRedundancy, uint8 newShards) internal virtual override(AgentRegistryCore, AgentRegistryMembership) {
        super._afterAgentUpdate(agentId,newMetadata,newChainIds,newRedundancy,newShards);
    }

    /**
     * @notice Hook _after agent enable
     * @dev emits Router hook
     * @param agentId ERC721 token id of the agent.
     * @param permission the sender claims to have to enable the agent.
     * @param value true if enabling, false if disabling.
     */
    function _afterAgentEnable(uint256 agentId, Permission permission, bool value) internal virtual override(AgentRegistryEnable, AgentRegistryMembership) {
        super._afterAgentEnable(agentId,permission,value);
    }

    /**
     * @notice Check if agent is enabled
     * @param agentId ERC721 token id of the agent.
     * @return true if agent owner has a valid key in either subscription plan,
     * the agent exists, has not been disabled, and is staked over minimum
     * Returns false if otherwise
     */
    function isEnabled(uint256 agentId) public view virtual override(AgentRegistryEnable, AgentRegistryMembership) returns (bool) {
        return super.isEnabled(agentId);
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
    function _activeAgentUnitsBalanceUpdate(address account, uint256 agentId, uint256 agentUnits, AgentModification agentMod) internal virtual override(AgentRegistryCore, AgentRegistryMembership) {
        super._activeAgentUnitsBalanceUpdate(account, agentId, agentUnits, agentMod);
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

    // uint256[1] private __gap;
}
