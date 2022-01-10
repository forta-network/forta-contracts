// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../BaseComponentUpgradeable.sol";

import "./AgentRegistryCore.sol";
import "./AgentRegistryEnable.sol";
import "./AgentRegistryEnumerable.sol";
import "./AgentRegistryMetadata.sol";
import "../utils/MinStakeAware.sol";

contract AgentRegistry is
    BaseComponentUpgradeable,
    AgentRegistryCore,
    AgentRegistryEnable,
    AgentRegistryMetadata,
    AgentRegistryEnumerable,
    MinStakeAwareUpgradeable
{
    string public constant version = "0.1.2";
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

    function isEnabled(uint256 agentId) public view override returns (bool) {
        return super.isEnabled(agentId) && _isStakedOverMin(AGENT_SUBJECT, agentId); 
    }

    function enableAgent(uint256 agentId, Permission permission) public override {
        require(_isStakedOverMin(AGENT_SUBJECT, agentId), "AgentRegistry: agent staked under minimum");
        super.enableAgent(agentId, permission);
    }

    function _msgSender() internal view virtual override(ContextUpgradeable, BaseComponentUpgradeable, AgentRegistryCore) returns (address sender) {
        return super._msgSender();
    }

    function _msgData() internal view virtual override(ContextUpgradeable, BaseComponentUpgradeable, AgentRegistryCore) returns (bytes calldata) {
        return super._msgData();
    }

    uint256[50] private __gap;
}
