// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

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


    modifier onlyOwnerOf(uint256 agentId) {
        if (_msgSender() != ownerOf(agentId)) revert SenderNotOwner(_msgSender(), agentId);
        _;
    }

    modifier onlySorted(uint256[] memory array) {
        if (array.length == 0 ) revert EmptyArray("chainIds");
        for (uint256 i = 1; i < array.length; i++ ) {
            if (array[i] <= array[i-1]) revert UnorderedArray("chainIds");
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
    * Stake
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
     * Checks if agent is staked over minimium stake
     * @param subject agentId
     * @return true if agent is staked over the minimum threshold, or staking is not yet enabled (stakeController = 0).
     * false otherwise
     */
    function _isStakedOverMin(uint256 subject) internal override view returns(bool) {
        if (address(getStakeController()) == address(0)) {
            return true;
        }
        return getStakeController().activeStakeFor(AGENT_SUBJECT, subject) >= _stakeThreshold.min;
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

    uint256[41] private __gap; // 50 - 1 (frontRunningDelay) - 3 (_stakeThreshold) - 5 StakeSubjectUpgradeable
}
