// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../../errors/GeneralErrors.sol";

import "./AgentRegistryCore.sol";
import "./AgentRegistryMetadata.sol";
import "../bot_execution/ILock.sol";
import "../bot_execution/IBotUnits.sol";

/**
 * This contract has the access and permission to update the balance of active agent units
 * for a specific agent owner. If the balance of active units needs to either increase
 * or decrease, this contract will call into BotUnits to update that. It also includes
 * functionality to allow specific agents to be declared public goods, which means they
 * would not need agent units to function and execute. It also allows for a free trial
 * limit, which allows a agent to also function and execute without the need for agent units
 * if it falls below the limit set by the free trial.
 */
abstract contract AgentRegistryMembership is AgentRegistryCore, AgentRegistryMetadata {

    uint8 constant MAX_FREE_TRIAL_AGENT_UNITS = 100;
    uint8 private _freeTrialAgentUnits;
    uint256 private _executionFeesStartTime;

    ILock _individualPlan;
    ILock _teamPlan;
    IBotUnits _botUnits;

    mapping(uint256 => bool) private _isAgentIdPublicGood;
    mapping(uint256 => bool) private _isAgentPartOfFreeTrial;
    mapping(uint256 => bool) private _isExistingAgentMigratedToExecutionFees;

    event ExistingAgentMigrated(address indexed owner, uint256 indexed agentId);
    event PublicGoodAgentDeclared(uint256 indexed agentId);
    event FreeTrailAgentUnitsUpdated(uint256 indexed amount);

    error ValidMembershipRequired(address account);
    error FreeTrialUnitsExceedsMax(uint8 maxFreeTrialUnits, uint8 exceedingAmount);
    error AgentIsAlreadyPublicGood(uint256 agentId);
    error ValueAlreadySet(uint8 value);
    error ExecutionFeesNotLive(uint256 currentTime, uint256 startTime);
    error AgentAlreadyMigratedToExecutionFees(uint256 agentId);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address __individualPlan, address __teamPlan, address __botUnits) {
        if (__individualPlan == address(0)) revert ZeroAddress("__individualPlan");
        if (__teamPlan == address(0)) revert ZeroAddress("__teamPlan");
        if (__botUnits == address(0)) revert ZeroAddress("__botUnits");

        _individualPlan = ILock(__individualPlan);
        _teamPlan = ILock(__teamPlan);
        _botUnits = IBotUnits(__botUnits);
    }

    /**
     * @notice Allows an agent owner to migrate their existing agents to the execution fees sytem.
     * @dev Only an agent owner has the permission to carry this out.
     * @param agentId ERC721 token id of existing agent to be "migrated" to execution fees system.
     */
    function activateExecutionFeesFor(uint256 agentId) external onlyOwnerOf(agentId) {
        uint256 executionFeesStartTime = _executionFeesStartTime;
        if (block.timestamp > executionFeesStartTime) revert ExecutionFeesNotLive(block.timestamp, executionFeesStartTime);
        address msgSender = _msgSender();
        if (!(_individualPlan.getHasValidKey(msgSender) || _teamPlan.getHasValidKey(msgSender))) {
            revert ValidMembershipRequired(msgSender);
        }
        if(isExistingAgentMigratedToExecutionFees(agentId)) revert AgentAlreadyMigratedToExecutionFees(agentId);
        uint256 agentUnitsNeeded = existingAgentActiveUnitUsage(agentId);
        // Passing AgentModification.Create for agentMod since
        // existing agent doesn't "exist" in new system
        _agentUnitsUpdate(msgSender, agentId, agentUnitsNeeded, AgentModification.Create);
        _isExistingAgentMigratedToExecutionFees[agentId] = true;
        emit ExistingAgentMigrated(msgSender, agentId);
    }
    
    /**
     * TODO:
     * 1. Review the logic
     */
    /**
     * @notice Function that checks whether the agent and/or owner meets certain criteria.
     * Criteria: Has a valid key in either plan, agent is marked a public good, or if
     * needed agent units for the agent is under free trial threshold.
     * @param account Address of agent owner.
     * @param agentId ERC721 token id of existing agent to be "migrated" to execution fees system.
     * @param amount Agent units needed.
     */
    function _agentUnitsRequirementCheck(address account, uint256 agentId, uint256 amount) internal virtual override returns(bool) {
        super._agentUnitsRequirementCheck(account, agentId, amount);
        if(!(_individualPlan.getHasValidKey(account) || _teamPlan.getHasValidKey(account))) {
            revert ValidMembershipRequired(account);
        }
        if(_isAgentIdPublicGood[agentId]) {
            _isAgentPartOfFreeTrial[agentId] = false;
            return true;
        }
        if(amount <= _freeTrialAgentUnits) {
            _isAgentPartOfFreeTrial[agentId] = true;
            return true;
        }
        _isAgentPartOfFreeTrial[agentId] = false;
        return false;
    }

    /**
     * @notice Internal function that updates an agent's owner balance of active agent units
     * depending on whether an agent is created, updated, disabled, or enabled.
     * @dev Calls updateOwnerActiveBotUnits in BotUnits, which this contract has access to.
     * @param account Owner of agent being modified.
     * @param agentId ERC721 token id of existing agent to be modified.
     * @param agentUnits Amount of agent units the owner's active balance needs to increase/decease.
     * @param agentMod The modification being done to the agent. Create, Update, Disable, or Enable.
     */
    function _agentUnitsUpdate(address account, uint256 agentId, uint256 agentUnits, AgentModification agentMod) internal virtual override {
        super._agentUnitsUpdate(account, agentId, agentUnits, agentMod);
        
        if(agentMod == AgentModification.Create || agentMod == AgentModification.Enable) {
            _botUnits.updateOwnerActiveBotUnits(account, agentUnits, true);
        } else if (agentMod == AgentModification.Disable) {
            _botUnits.updateOwnerActiveBotUnits(account, agentUnits, false);
        } else if (agentMod == AgentModification.Disable) {
            uint256 existingAgentUnitsUsage = existingAgentActiveUnitUsage(agentId);
            // Figure out the bool for balanceIncrease since an agent update
            // could increase or decrease the needed active agent units
            bool balanceIncrease = agentUnits >= existingAgentUnitsUsage;
            _botUnits.updateOwnerActiveBotUnits(account, agentUnits, balanceIncrease);
        }
    }

    /**
     * @notice Fetch the amount of active agent units a given agent uses/requires.
     * @param agentId ERC721 token id of given agent.
     * @return Amount of agent units the given agent uses/requires
     */
    function existingAgentActiveUnitUsage(uint256 agentId) public view returns (uint256) {
        (,,,,uint256[] memory chainIds) = super.getAgent(agentId);
        return super.calculateAgentUnitsNeeded(chainIds.length);
    }
    
    function _agentUpdate(uint256 agentId, string memory newMetadata, uint256[] calldata newChainIds) internal virtual override(AgentRegistryCore, AgentRegistryMetadata) {
        super._agentUpdate(agentId,newMetadata,newChainIds);
    }

    /**
     * @notice Setter to allow ability to declare a specific agent a public good.
     * @dev Behind access control to mentioned role.
     * @param agentId ERC721 token id of agent that is to be declared a public good.
     */
    function setAgentAsPublicGood(uint256 agentId) external onlyRole(PUBLIC_GOOD_ADMIN_ROLE) {
        if (_isAgentIdPublicGood[agentId]) revert AgentIsAlreadyPublicGood(agentId);
        _isAgentIdPublicGood[agentId] = true;
        emit PublicGoodAgentDeclared(agentId);
    }

    /**
     * @notice Setter to allow ability to change the allowable
     * amount of agent units as part of the "free trial".
     * @dev Behind access control to mentioned role. Also cannot exceed the maximum
     * allowable amount.
     * @param agentUnits Amount of agent units that are granted to an agent as part
     * of a "free trial".
     */
    function setFreeTrialAgentUnits(uint8 agentUnits) external onlyRole(FREE_TRIAL_ADMIN_ROLE) {
        if (agentUnits == 0) revert ZeroAmount("agentUnits");
        if (agentUnits > MAX_FREE_TRIAL_AGENT_UNITS) revert FreeTrialUnitsExceedsMax(MAX_FREE_TRIAL_AGENT_UNITS, agentUnits);
        if (_freeTrialAgentUnits == agentUnits) revert ValueAlreadySet(agentUnits);
        _freeTrialAgentUnits = agentUnits;
        emit FreeTrailAgentUnitsUpdated(agentUnits);
    }

    /**
     * @notice Getter informing whether a specific agent is a public good.
     * @param agentId ERC721 token id of agent.
     * @return bool indicating whether the specific agent is a public good or not
     */
    function isPublicGoodAgent(uint256 agentId) public view returns(bool) {
        return _isAgentIdPublicGood[agentId];
    }

    /**
     * @notice Getter returning the current limit of the "free trial".
     * @return uint8 serving as the current allowable limit for the free trial.
     */
    function getFreeTrialAgentUnitsLimit() public view returns (uint8) {
        return _freeTrialAgentUnits;
    }

    /**
     * @notice Getter informing whether a specific agent is part of the "free trial".
     * @param agentId ERC721 token id of agent.
     * @return bool indicating whether the specific agent is under the free trial or not.
     */
    function isAgentPartOfFreeTrial(uint256 agentId) public view returns(bool) {
        return _isAgentPartOfFreeTrial[agentId];
    }
    
    /**
     * @notice Getter returning whether or not the specific agent has "migrated"
     * to the execution fees system.
     * @param agentId ERC721 token id of agent.
     * @return bool indicating whether or not the given agent has migrated.
     */
    function isExistingAgentMigratedToExecutionFees(uint256 agentId) public view returns (bool) {
        return _isExistingAgentMigratedToExecutionFees[agentId];
    }

    /**
     *  50
     * - 1 _freeTrialAgentUnits
     * - 1 _executionFeesStartTime
     * - 1 _individualPlan
     * - 1 _teamPlan
     * - 1 _botUnits
     * - 1 _isAgentIdPublicGood
     * - 1 _isAgentPartOfFreeTrial
     * - 1 _isExistingAgentMigratedToExecutionFees
     * --------------------------
     *  42 __gap
     */
    uint256[42] private __gap;
}