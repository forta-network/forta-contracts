// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../BaseComponent.sol";

import "./AgentRegistryCore.sol";
import "./AgentRegistryMetadata.sol";
import "./AgentRegistryEnumerable.sol";

contract AgentRegistry is BaseComponent, AgentRegistryMetadata, AgentRegistryEnumerable
{
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

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

    function _beforeAgentUpdate(uint256 agentId, string memory newMetadata, uint256[] calldata newChainIds) internal virtual override(AgentRegistryCore, AgentRegistryEnumerable) {
        super._beforeAgentUpdate(agentId, newMetadata, newChainIds);
    }
}
