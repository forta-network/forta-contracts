// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../BaseComponent.sol";

import "./AgentRegistryCore.sol";
import "./AgentRegistryEnable.sol";
import "./AgentRegistryEnumerable.sol";
import "./AgentRegistryMetadata.sol";

contract AgentRegistry is
    BaseComponent,
    AgentRegistryCore,
    AgentRegistryEnable,
    AgentRegistryMetadata,
    AgentRegistryEnumerable
{
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

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

    function _agentUpdate(uint256 agentId, string memory newMetadata, uint256[] calldata newChainIds) internal virtual override(AgentRegistryCore, AgentRegistryMetadata) {
        super._agentUpdate(agentId, newMetadata, newChainIds);
    }

    function _msgSender() internal view virtual override(BaseComponent, AgentRegistryCore) returns (address sender) {
        return super._msgSender();
    }

    function _msgData() internal view virtual override(BaseComponent, AgentRegistryCore) returns (bytes calldata) {
        return super._msgData();
    }

    uint256[50] private __gap;
}
