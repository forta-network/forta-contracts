// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";

import "../BaseComponentUpgradeable.sol";
import "../../tools/FrontRunningProtection.sol";

abstract contract AgentRegistryCore is
    BaseComponentUpgradeable,
    FrontRunningProtection,
    ERC721Upgradeable
{
    event AgentCommitted(bytes32 indexed commit);
    event AgentUpdated(uint256 indexed agentId, address indexed by, string metadata, uint256[] chainIds);

    /**
     * @notice Checks sender (or metatx signer) is owner of the agent token.
     * @param agentId ERC1155 token id of the agent.
     */
    modifier onlyOwnerOf(uint256 agentId) {
        require(_msgSender() == ownerOf(agentId), "AgentRegistryCore: Restricted to agent owner");
        _;
    }

    /**
     * @notice Checks if array of uint256 is sorted from lower (index 0) to higher (array.length -1)
     * @param array to check
     */
    modifier onlySorted(uint256[] memory array) {
        require(array.length > 0, "AgentRegistryCore: At least one chain id required");
        for (uint256 i = 1; i < array.length; ++i ) {
            require(array[i] > array[i-1], "AgentRegistryCore: Values must be sorted");
        }
        _;
    }

    /**
     * @notice Save commit representing an agent to prevent frontrunning of their creation
     * @param commit keccak256 hash of the agent creation's parameters
     */
    function prepareAgent(bytes32 commit) public {
        _frontrunCommit(commit);
        emit AgentCommitted(commit);
    }

    /**
     * @notice Agent creation method. Mints an ERC1155 token with the agent id for the owner and stores metadata.
     * @dev fires _before and _after hooks within the inheritance tree.
     * If front run protection is enabled (disabled by default), it will check if the keccak256 hash of the parameters
     * has been commited in prepareAgent(bytes32).
     * @param agentId ERC1155 token id of the agent to be created.
     * @param owner address to have ownership privileges in the agent methods.
     * @param metadata IPFS pointer to agent's metadata JSON.
     * @param chainIds ordered list of chainIds where the agent wants to run.
     */
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

    /**
     * @notice Checks if the agentId has been minted.
     * @param agentId ERC1155 token id of the agent.
     * @return true if agentId exists, false otherwise.
     */
    function isCreated(uint256 agentId) public view returns(bool) {
        return _exists(agentId);
    }

    /**
     * @notice Updates parameters of an agentId (metadata, image, chain IDs...) if called by the agent owner.
     * @dev fires _before and _after hooks within the inheritance tree.
     * @param agentId ERC1155 token id of the agent to be updated.
     * @param metadata IPFS pointer to agent's metadata JSON.
     * @param chainIds ordered list of chainIds where the agent wants to run. 
     */
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
     * @notice hook fired before agent creation or update.
     * @dev does nothing in this contract.
     * @param agentId ERC1155 token id of the agent to be created or updated.
     * @param newMetadata IPFS pointer to agent's metadata JSON.
     * @param newChainIds ordered list of chainIds where the agent wants to run.
     */
    function _beforeAgentUpdate(uint256 agentId, string memory newMetadata, uint256[] calldata newChainIds) internal virtual {
    }

    /**
     * @notice logic for agent update.
     * @dev emits AgentUpdated, will be extended by child contracts.
     * @param agentId ERC1155 token id of the agent to be created or updated.
     * @param newMetadata IPFS pointer to agent's metadata JSON.
     * @param newChainIds ordered list of chainIds where the agent wants to run.
     */
    function _agentUpdate(uint256 agentId, string memory newMetadata, uint256[] calldata newChainIds) internal virtual {
        emit AgentUpdated(agentId, _msgSender(), newMetadata, newChainIds);
    }

    /**
     * @notice hook fired after agent creation or update.
     * @dev emits Router hook.
     * @param agentId ERC1155 token id of the agent to be created or updated.
     * @param newMetadata IPFS pointer to agent's metadata JSON.
     * @param newChainIds ordered list of chainIds where the agent wants to run.
     */
    function _afterAgentUpdate(uint256 agentId, string memory newMetadata, uint256[] calldata newChainIds) internal virtual {
        _emitHook(abi.encodeWithSignature("hook_afterAgentUpdate(uint256)", agentId));
    }

    /**
     * Obligatory inheritance dismambiguation of ForwardedContext's _msgSender()
     * @return sender msg.sender if not a meta transaction, signer of forwarder metatx if it is.
     */
    function _msgSender() internal view virtual override(ContextUpgradeable, BaseComponentUpgradeable) returns (address sender) {
        return super._msgSender();
    }

    /**
     * Obligatory inheritance dismambiguation of ForwardedContext's _msgSender()
     * @return sender msg.data if not a meta transaction, forwarder data in metatx if it is.
     */
    function _msgData() internal view virtual override(ContextUpgradeable, BaseComponentUpgradeable) returns (bytes calldata) {
        return super._msgData();
    }

    uint256[45] private __gap;
}
