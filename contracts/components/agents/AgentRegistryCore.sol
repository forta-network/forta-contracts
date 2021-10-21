// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";

import "../BaseComponent.sol";
import "../../tools/FrontRunningProtection.sol";

abstract contract AgentRegistryCore is
    BaseComponent,
    FrontRunningProtection,
    ERC721Upgradeable
{
    event AgentCommitted(bytes32 indexed commit);
    event AgentUpdated(uint256 indexed agentId, address indexed by, string metadata, uint256[] chainIds);

    modifier onlyOwnerOf(uint256 agentId) {
        require(_msgSender() == ownerOf(agentId), "Restricted to agent owner");
        _;
    }

    modifier onlySorted(uint256[] memory array) {
        require(array.length > 0, "At least one chain id required");
        for (uint256 i = 1; i < array.length; ++i ) {
            require(array[i] > array[i-1], "Values must be sorted");
        }
        _;
    }

    function prepareAgent(bytes32 commit) public {
        _frontrunCommit(commit);
        emit AgentCommitted(commit);
    }

    function createAgent(uint256 agentId, address owner, string calldata metadata, uint256[] calldata chainIds)
    public
        onlySorted(chainIds)
        frontrunProtected(keccak256(abi.encodePacked(agentId, owner, metadata, chainIds)), 0 minutes) // TODO: 0 disables the check
    {
        _mint(owner, agentId);
        _beforeAgentUpdate(agentId, metadata, chainIds);
        _agentUpdate(agentId, metadata, chainIds);
        _afterAgentUpdate(agentId, metadata, chainIds);
    }

    function updateAgent(uint256 agentId, string calldata metadata, uint256[] calldata chainIds)
    public
        onlyOwnerOf(agentId)
        onlySorted(chainIds)
        frontrunProtected(keccak256(abi.encodePacked(agentId, metadata, chainIds)), 0 minutes) // TODO: 0 disables the check
    {
        _beforeAgentUpdate(agentId, metadata, chainIds);
        _agentUpdate(agentId, metadata, chainIds);
        _afterAgentUpdate(agentId, metadata, chainIds);
    }

    /**
     * Hook: Agent metadata change (create/update)
     */
    function _beforeAgentUpdate(uint256 agentId, string memory newMetadata, uint256[] calldata newChainIds) internal virtual {
    }

    function _agentUpdate(uint256 agentId, string memory newMetadata, uint256[] calldata newChainIds) internal virtual {
        emit AgentUpdated(agentId, _msgSender(), newMetadata, newChainIds);
    }

    function _afterAgentUpdate(uint256 agentId, string memory newMetadata, uint256[] calldata newChainIds) internal virtual {
        _emitHook(abi.encodeWithSignature("hook_afterAgentUpdate(uint256)", agentId));
    }

    function _msgSender() internal view virtual override(ContextUpgradeable, BaseComponent) returns (address sender) {
        return super._msgSender();
    }

    function _msgData() internal view virtual override(ContextUpgradeable, BaseComponent) returns (bytes calldata) {
        return super._msgData();
    }

    uint256[50] private __gap;
}
