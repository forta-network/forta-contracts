// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";

import "../BaseComponentUpgradeable.sol";
import "../staking/StakeSubject.sol";
import "../../tools/FrontRunningProtection.sol";
import "../../errors/GeneralErrors.sol";

abstract contract AgentRegistryCore is
    BaseComponentUpgradeable,
    FrontRunningProtection,
    ERC721Upgradeable,
    StakeSubjectUpgradeable
{
    StakeThreshold private _stakeThreshold; // 3 storage slots
    // Initially 0 because the frontrunning protection starts disabled.
    uint256 public frontRunningDelay;
    
    event AgentCommitted(bytes32 indexed commit);
    event AgentUpdated(uint256 indexed agentId, address indexed by, string metadata, uint256[] chainIds);
    event StakeThresholdChanged(uint256 min, uint256 max, bool activated);
    event FrontRunningDelaySet(uint256 delay);


    /**
     * @notice Checks sender (or metatx signer) is owner of the agent token.
     * @param agentId ERC721 token id of the agent.
     */
    modifier onlyOwnerOf(uint256 agentId) {
        if (_msgSender() != ownerOf(agentId)) revert SenderNotOwner(_msgSender(), agentId);
        _;
    }

    /**
     * @notice Checks if array of uint256 is sorted from lower (index 0) to higher (array.length -1)
     * @param array to check
     */
    modifier onlySorted(uint256[] memory array) {
        if (array.length == 0 ) revert EmptyArray("chainIds");
        for (uint256 i = 1; i < array.length; i++ ) {
            if (array[i] <= array[i-1]) revert UnorderedArray("chainIds");
        }
        _;
    }

    /**
     * @notice Save commit representing an agent to prevent frontrunning of their creation
     * @param commit keccak256 hash of the agent creation's parameters
     */
    function prepareAgent(bytes32 commit) public {
        _frontrunCommit(commit);
    }

    /**
     * @notice Agent creation method. Mints an ERC721 token with the agent id for the owner and stores metadata.
     * @dev fires _before and _after hooks within the inheritance tree.
     * If front run protection is enabled (disabled by default), it will check if the keccak256 hash of the parameters
     * has been committed in prepareAgent(bytes32).
     * @param agentId ERC721 token id of the agent to be created.
     * @param owner address to have ownership privileges in the agent methods.
     * @param metadata IPFS pointer to agent's metadata JSON.
     * @param chainIds ordered list of chainIds where the agent wants to run.
     */
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

    /**
     * @notice Checks if the agentId has been minted.
     * @param agentId ERC721 token id of the agent.
     * @return true if agentId exists, false otherwise.
     */
    function isRegistered(uint256 agentId) public view returns(bool) {
        return _exists(agentId);
    }

    /**
     * @notice Updates parameters of an agentId (metadata, image, chain IDs...) if called by the agent owner.
     * @dev fires _before and _after hooks within the inheritance tree.
     * @param agentId ERC721 token id of the agent to be updated.
     * @param metadata IPFS pointer to agent's metadata JSON.
     * @param chainIds ordered list of chainIds where the agent wants to run. 
     */
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
     @dev StakeThreshold setter, common to all Agents. Restricted to AGENT_ADMIN_ROLE, emits StakeThresholdChanged
    */
    function setStakeThreshold(StakeThreshold memory newStakeThreshold) external onlyRole(AGENT_ADMIN_ROLE) {
        if (newStakeThreshold.max <= newStakeThreshold.min) revert StakeThresholdMaxLessOrEqualMin();
        _stakeThreshold = newStakeThreshold;
        emit StakeThresholdChanged(newStakeThreshold.min, newStakeThreshold.max, newStakeThreshold.activated);
    }

    /**
     @dev stake threshold common for all agents
    */
    function getStakeThreshold(uint256 /*subject*/) public override view returns (StakeThreshold memory) {
        return _stakeThreshold;
    }

    /**
     * Checks if agent is staked over minimum stake
     * @param subject agentId
     * @return true if agent is staked over the minimum threshold and is, or staking is not yet enabled (stakeController = 0).
     * false otherwise
     */
    function _isStakedOverMin(uint256 subject) internal override view returns(bool) {
        if (address(getStakeController()) == address(0)) {
            return true;
        }
        return getStakeController().activeStakeFor(AGENT_SUBJECT, subject) >= _stakeThreshold.min && _exists(subject);
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
     * @notice hook fired before agent creation or update.
     * @dev does nothing in this contract.
     * @param agentId ERC721 token id of the agent to be created or updated.
     * @param newMetadata IPFS pointer to agent's metadata JSON.
     * @param newChainIds ordered list of chainIds where the agent wants to run.
    */
    function _beforeAgentUpdate(uint256 agentId, string memory newMetadata, uint256[] calldata newChainIds) internal virtual {
    }

    /**
     * @notice logic for agent update.
     * @dev emits AgentUpdated, will be extended by child contracts.
     * @param agentId ERC721 token id of the agent to be created or updated.
     * @param newMetadata IPFS pointer to agent's metadata JSON.
     * @param newChainIds ordered list of chainIds where the agent wants to run.
     */
    function _agentUpdate(uint256 agentId, string memory newMetadata, uint256[] calldata newChainIds) internal virtual {
        emit AgentUpdated(agentId, _msgSender(), newMetadata, newChainIds);
    }

    /**
     * @notice hook fired after agent creation or update.
     * @dev emits Router hook.
     * @param agentId ERC721 token id of the agent to be created or updated.
     * @param newMetadata IPFS pointer to agent's metadata JSON.
     * @param newChainIds ordered list of chainIds where the agent wants to run.
     */
    function _afterAgentUpdate(uint256 agentId, string memory newMetadata, uint256[] calldata newChainIds) internal virtual {
        _emitHook(abi.encodeWithSignature("hook_afterAgentUpdate(uint256,string,uint256[])", agentId, newMetadata, newChainIds));
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

    uint256[41] private __gap; // 50 - 1 (frontRunningDelay) - 3 (_stakeThreshold) - 5 StakeSubjectUpgradeable
}
