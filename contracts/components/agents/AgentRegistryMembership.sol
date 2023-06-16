// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@unlock-protocol/contracts/dist/PublicLock/IPublicLockV13.sol";
import "../../errors/GeneralErrors.sol";

import "./AgentRegistryCore.sol";
import "./AgentRegistryMetadata.sol";
import "./AgentRegistryEnable.sol";
import "../bot_execution/IBotUnits.sol";

import "hardhat/console.sol";

/**
 * This contract has the access and permission to update the balance of active agent units
 * for a specific agent owner. If the balance of active units needs to either increase
 * or decrease, this contract will call into BotUnits to update that. It also includes
 * functionality to allow specific agents to be declared public goods, which means they
 * would not need agent units to function and execute. It also allows for a free trial
 * limit, which allows a agent to also function and execute without the need for agent units
 * if it falls below the limit set by the free trial.
 */
abstract contract AgentRegistryMembership is AgentRegistryEnable {

    uint8 constant MAX_FREE_TRIAL_AGENT_UNITS = 100;
    uint8 private _freeTrialAgentUnits;
    uint256 private _executionFeesStartTime;

    IPublicLockV13 _individualPlan;
    IPublicLockV13 _teamPlan;
    IBotUnits _botUnits;

    mapping(uint256 => bool) private _isAgentIdPublicGood;
    mapping(uint256 => bool) private _isAgentPartOfFreeTrial;
    mapping(uint256 => bool) private _isAgentUtilizingAgentUnits;

    event AgentOnExecutionFeesSystem(uint256 indexed agentId);
    event PublicGoodAgentDeclared(uint256 indexed agentId);
    event FreeTrailAgentUnitsUpdated(uint256 indexed amount);

    error ValidMembershipRequired(address account);
    error FreeTrialUnitsExceedsMax(uint8 maxFreeTrialUnits, uint8 exceedingAmount);
    error AgentIsAlreadyPublicGood(uint256 agentId);
    error ValueAlreadySet(uint8 value);
    error ExecutionFeesNotLive(uint256 currentTime, uint256 startTime);
    error AgentAlreadyMigratedToExecutionFees(uint256 agentId);
    error UnregisteredAgent(uint256 agentId);

    /**
     * @notice Initializer method
     * @param __individualPlan Address of individual plan Lock contract.
     * @param __teamPlan Address of team plan Lock contract.
     * @param __botUnits Address of BotUnits contract.
     */
    function __AgentRegistryMembership_init(address __individualPlan, address __teamPlan, address __botUnits, uint256 __executionFeesStartTime) internal initializer {
        if (__individualPlan == address(0)) revert ZeroAddress("__individualPlan");
        if (__teamPlan == address(0)) revert ZeroAddress("__teamPlan");
        if (__botUnits == address(0)) revert ZeroAddress("__botUnits");
        if (__executionFeesStartTime == 0) revert ZeroAmount("__executionFeesStartTime");

        _individualPlan = IPublicLockV13(__individualPlan);
        _teamPlan = IPublicLockV13(__teamPlan);
        _botUnits = IBotUnits(__botUnits);
        _executionFeesStartTime = __executionFeesStartTime;
    }

    function setSubscriptionPlans(address __individualPlan, address __teamPlan) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (__individualPlan == address(0)) revert ZeroAddress("_individualPlan");
        if (__teamPlan == address(0)) revert ZeroAddress("_teamPlan");

        _individualPlan = IPublicLockV13(__individualPlan);
        _teamPlan = IPublicLockV13(__teamPlan);
    }

    function setBotUnits(address __botUnits) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (__botUnits == address(0)) revert ZeroAddress("__botUnits");

        _botUnits = IBotUnits(__botUnits);
    }

    function setExecutionFeesStartTime(uint256 __executionFeesStartTime) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (__executionFeesStartTime == 0) revert ZeroAmount("__executionFeesStartTime");

        _executionFeesStartTime = __executionFeesStartTime;
    }
    
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
     * @param agentUnits Amount of agent units the update will require.
     * @param agentMod The modification being done to the agent. Create, Update, Disable, or Enable.
     */
    function _agentUnitsUpdate(address account, uint256 agentId, uint256 agentUnits, AgentModification agentMod) internal virtual override {
        super._agentUnitsUpdate(account, agentId, agentUnits, agentMod);
        
        if(agentMod == AgentModification.Create || agentMod == AgentModification.Enable) {
            _botUnits.updateOwnerActiveBotUnits(account, agentUnits, true);
        } else if (agentMod == AgentModification.Disable) {
            _botUnits.updateOwnerActiveBotUnits(account, agentUnits, false);
        } else if (agentMod == AgentModification.Update) {
            uint256 existingAgentUnitsUsage = existingAgentActiveUnitUsage(agentId);
            bool balanceIncrease;
            uint256 agentUnitsForUpdate;
            if(agentUnits >= existingAgentUnitsUsage) {
                balanceIncrease = true;
                agentUnitsForUpdate = agentUnits - existingAgentUnitsUsage;
            } else {
                balanceIncrease = false;
                agentUnitsForUpdate = existingAgentUnitsUsage - agentUnits;
            }
            _botUnits.updateOwnerActiveBotUnits(account, agentUnitsForUpdate, balanceIncrease);
        }
    }

    /**
     * @notice Fetch the amount of active agent units a given agent uses/requires.
     * @param agentId ERC721 token id of given agent.
     * @return Amount of agent units the given agent uses/requires
     */
    function existingAgentActiveUnitUsage(uint256 agentId) public view virtual returns (uint256) { }
    
    function _agentUpdate(
        uint256 agentId,
        string memory newMetadata,
        uint256[] calldata newChainIds,
        uint8 newRedundancy,
        uint8 newShards
    ) internal virtual override {
        super._agentUpdate(agentId,newMetadata,newChainIds,newRedundancy,newShards);
    }

    /**
     * @notice Updates an agent's status to indicate it is a participant
     * in the execution fees system.
     * @param agentId ERC721 token id of the agent.
     * @param newMetadata IPFS pointer to agent's metadata JSON.
     * @param newChainIds ordered list of chainIds where the agent wants to run.
     */
    function _afterAgentUpdate(
        uint256 agentId,
        string memory newMetadata,
        uint256[] calldata newChainIds
    ) internal virtual override(AgentRegistryCore) {
        super._afterAgentUpdate(agentId,newMetadata,newChainIds);

        if(!_isAgentUtilizingAgentUnits[agentId]) {
            _setAgentToUtilizeAgentUnits(agentId, true);
        }
    }

    /**
     * @notice Hook _after agent enable
     * @dev emits Router hook
     * @param agentId ERC721 token id of the agent.
     * @param permission the sender claims to have to enable the agent.
     * @param value true if enabling, false if disabling.
     */
    function _afterAgentEnable(uint256 agentId, Permission permission, bool value) internal virtual override {
        super._afterAgentEnable(agentId,permission,value);

        if(value) {
            _setAgentToUtilizeAgentUnits(agentId, value);
        }
    }

    /**
     * @notice Internal methods for enabling the agent.
     * @dev fires hook _before and _after enable within the inheritance tree.
     * @param agentId ERC721 token id of the agent.
     * @param permission the sender claims to have to enable the agent.
     * @param enable true if enabling, false if disabling.
     */
    function _enable(uint256 agentId, Permission permission, bool enable) internal virtual override {
        super._enable(agentId, permission, enable);
    }

    /**
     * @notice Updates an agent's status to indicate whether it
     * is a participant in the execution fees system or not.
     * @param agentId ERC721 token id of the agent.
     * @param utilizingAgentUnits whether the agent will utilize
     * agent units.
     */
    function _setAgentToUtilizeAgentUnits(uint256 agentId, bool utilizingAgentUnits) internal {
        _isAgentUtilizingAgentUnits[agentId] = utilizingAgentUnits;
        emit AgentOnExecutionFeesSystem(agentId);
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
     * @notice Check if agent is enabled
     * @param agentId ERC721 token id of the agent.
     * @return true if agent owner has a valid key in either subscription plan,
     * the agent exists, has not been disabled, and is staked over minimum
     * Returns false if otherwise
     */
    function isEnabled(uint256 agentId) public view virtual override returns (bool) {
        super.isEnabled(agentId);

        address agentOwner = super.ownerOf(agentId);
        return (
            (_individualPlan.getHasValidKey(agentOwner) || _teamPlan.getHasValidKey(agentOwner)) &&
            isRegistered(agentId) &&
            getDisableFlags(agentId) == 0 &&
            (!_isStakeActivated() || _isStakedOverMin(agentId)) &&
            isAgentUtilizingAgentUnits(agentId)
        );
    }

    /**
     * @notice Internal getter for when bot execution fees goes live
     * @return uint256 timestamp of when bot execution fees goes live
     */
    function _getExecutionFeesStartTime() internal view returns (uint256) {
        return _executionFeesStartTime;
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
     * @notice Getter returning whether or not a specific agent is a participant
     * in the execution fees system.
     * @param agentId ERC721 token id of agent.
     * @return bool indicating whether or not the given agent has migrated.
     */
    function isAgentUtilizingAgentUnits(uint256 agentId) public view returns (bool) {
        return _isAgentUtilizingAgentUnits[agentId];
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
     * - 1 __isAgentUtilizingAgentUnits
     * --------------------------
     *  42 __gap
     */
    uint256[42] private __gap;
}