// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.4;

import "../BaseComponentUpgradeable.sol";

import "./AgentRegistryCore.sol";
import "./AgentRegistryEnable.sol";
import "./AgentRegistryEnumerable.sol";
import "./AgentRegistryMetadata.sol";

contract AgentRegistry is
    BaseComponentUpgradeable,
    AgentRegistryCore,
    AgentRegistryEnable,
    AgentRegistryMetadata,
    AgentRegistryEnumerable
{
    string public constant version = "0.1.3";
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     * @param __router address of Router.
     * @param __name ERC1155 token name.
     * @param __symbol ERC1155 token symbol.
     */
    function initialize(
        address __manager,
        address __router,
        string calldata __name,
        string calldata __symbol
    ) public initializer {
        __AccessManaged_init(__manager);
        __Routed_init(__router);
        __UUPSUpgradeable_init();
        __ERC721_init(__name, __symbol);
    }

    /**
     * @notice Gets all Agent state.
     * @param agentId ERC1155 token id of the agent.
     * @return created if agent exists.
     * @return owner address.
     * @return agentVersion of the agent.
     * @return metadata IPFS pointer.
     * @return chainIds the agent wants to run in.
     */
    function getAgentState(uint256 agentId)
        public view
        returns (bool created, address owner,uint256 agentVersion, string memory metadata, uint256[] memory chainIds, bool enabled) {
        (created, owner, agentVersion, metadata, chainIds) = getAgent(agentId);
        return (created, owner, agentVersion, metadata, chainIds, isEnabled(agentId));
    }

    /**
     * @notice Inheritance disambiguation for hook fired befire agent update (and creation).
     * @param agentId id of the agent.
     * @param newMetadata IPFS pointer to agent's metadata
     * @param newChainIds chain ids that the agent wants to scan
     */
    function _beforeAgentUpdate(uint256 agentId, string memory newMetadata, uint256[] calldata newChainIds) internal virtual override(AgentRegistryCore, AgentRegistryEnumerable) {
        super._beforeAgentUpdate(agentId, newMetadata, newChainIds);
    }

    /**
     * @notice Obligatory inheritance disambiguation for hook fired for agent update (and creation).
     * @param agentId id of the agent.
     * @param newMetadata IPFS pointer to agent's metadata
     * @param newChainIds chain ids that the agent wants to scan
     */
    function _agentUpdate(uint256 agentId, string memory newMetadata, uint256[] calldata newChainIds) internal virtual override(AgentRegistryCore, AgentRegistryMetadata) {
        super._agentUpdate(agentId, newMetadata, newChainIds);
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
