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
    // Initially 0 because the frontrunning protection starts disabled.
    uint256 public frontRunningDelay; // __gap[45] -> __gap[44]

    event AgentUpdated(uint256 indexed agentId, address indexed by, string metadata, uint256[] chainIds);
    event FrontRunningDelaySet(uint256 delay);

    modifier onlyOwnerOf(uint256 agentId) {
        require(_msgSender() == ownerOf(agentId), "AgentRegistryCore: Restricted to agent owner");
        _;
    }

    modifier onlySorted(uint256[] memory array) {
        require(array.length > 0, "AgentRegistryCore: At least one chain id required");
        for (uint256 i = 1; i < array.length; ++i ) {
            require(array[i] > array[i-1], "AgentRegistryCore: Values must be sorted");
        }
        _;
    }

    function prepareAgent(bytes32 commit) public {
        _frontrunCommit(commit);
    }

    function createAgent(uint256 agentId, address owner, string calldata metadata, uint256[] calldata chainIds)
    public
        onlySorted(chainIds)
        frontrunProtected(keccak256(abi.encodePacked(agentId, owner, metadata, chainIds)), frontRunningDelay)
    {
        _mint(owner, agentId);
        _beforeAgentUpdate(agentId, metadata, chainIds);
        _agentUpdate(agentId, metadata, chainIds);
        _afterAgentUpdate(agentId, metadata, chainIds);
    }

    function isCreated(uint256 agentId) public view returns(bool) {
        return _exists(agentId);
    }

    function updateAgent(uint256 agentId, string calldata metadata, uint256[] calldata chainIds)
    public
        onlyOwnerOf(agentId)
        onlySorted(chainIds)
    {
        _beforeAgentUpdate(agentId, metadata, chainIds);
        _agentUpdate(agentId, metadata, chainIds);
        _afterAgentUpdate(agentId, metadata, chainIds);
    }

    /**
     * @dev allows AGENT_ADMIN_ROLE to activate frontrunning protection for agents
     * @param delay in seconds
     */
    function setFrontRunningDelay(uint256 delay) external onlyRole(AGENT_ADMIN_ROLE) {
        frontRunningDelay = delay;
        emit FrontRunningDelaySet(delay);
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
        _emitHook(abi.encodeWithSignature("hook_afterAgentUpdate(uint256,string,uint256[])", agentId, newMetadata, newChainIds));
    }

    function _msgSender() internal view virtual override(ContextUpgradeable, BaseComponentUpgradeable) returns (address sender) {
        return super._msgSender();
    }

    function _msgData() internal view virtual override(ContextUpgradeable, BaseComponentUpgradeable) returns (bytes calldata) {
        return super._msgData();
    }

    uint256[44] private __gap;
}
