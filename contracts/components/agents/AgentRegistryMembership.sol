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
    using BitMaps for BitMaps.BitMap;

    uint8 constant MAX_FREE_TRIAL_AGENT_UNITS = 100;
    uint8 private _freeTrialAgentUnits;
    uint256 private _executionFeesStartTime;

    IBotUnits _botUnits;

    mapping(uint256 => BitMaps.BitMap) private _isAgentPublicGood;
    mapping(uint256 => BitMaps.BitMap) private _isAgentPartOfFreeTrial;
    mapping(uint256 => BitMaps.BitMap) private _isAgentUtilizingAgentUnits;

    event SubscriptionPlansUpdated(address indexed individualPlan, address indexed teamPlan);
    event BotUnitsUpdated(address indexed botUnits);
    event ExecutionFeesStartTimeUpdated(uint256 indexed executionFeesStartTime);
    event AgentOnExecutionFeesSystem(uint256 indexed agentId);
    event PublicGoodAgentDeclared(uint256 indexed agentId);
    event FreeTrailAgentUnitsUpdated(uint256 indexed amount);

    error FreeTrialUnitsExceedsMax(uint8 maxFreeTrialUnits, uint8 exceedingAmount);
    error AgentAlreadyPublicGood(uint256 agentId);
    error ValueAlreadySet(uint8 value);
    error ExecutionFeesNotLive(uint256 currentTime, uint256 startTime);
    error AgentAlreadyMigratedToExecutionFees(uint256 agentId);

    /**
     * @dev allows AGENT_ADMIN_ROLE to set the contract that will
     * handle the accounting for bot units for a subscriber.
     * @param __botUnits The contract that will handle
     * the bot unit accounting
     */
    function setBotUnits(address __botUnits) external onlyRole(AGENT_ADMIN_ROLE) {
        if (__botUnits == address(0)) revert ZeroAddress("__botUnits");

        _botUnits = IBotUnits(__botUnits);
        emit BotUnitsUpdated(__botUnits);
    }
    
    /**
     * @dev allows AGENT_ADMIN_ROLE to set the time timestamp
     * of when agent execution fees will go live.
     * @param __executionFeesStartTime The timestamp afterwhich
     * agent execution fees will be live
     */
    function setExecutionFeesStartTime(uint256 __executionFeesStartTime) external onlyRole(AGENT_ADMIN_ROLE) {
        if (__executionFeesStartTime == 0) revert ZeroAmount("__executionFeesStartTime");

        _executionFeesStartTime = __executionFeesStartTime;
        emit ExecutionFeesStartTimeUpdated(__executionFeesStartTime);
    }

    /**
     * @notice Allows PUBLIC_GOOD_ADMIN_ROLE to declare a specific agent a public good.
     * @param agentId ERC721 token id of agent that is to be declared a public good.
     */
    function setAgentAsPublicGood(uint256 agentId) external onlyRole(PUBLIC_GOOD_ADMIN_ROLE) {
        if (isPublicGoodAgent(agentId)) revert AgentAlreadyPublicGood(agentId);

        // Passing `1` since each agent will only
        // have one `key` in its BitMap
        _isAgentPublicGood[agentId].setTo(1, true);
        emit PublicGoodAgentDeclared(agentId);
    }

    /**
     * @notice Allows AGENT_ADMIN_ROLE to change the allowable
     * amount of agent units as part of the "free trial".
     * @dev Cannot exceed the maximum allowable amount.
     * @param agentUnits Amount of agent units that are granted to
     * an agent as part of a "free trial".
     */
    function setFreeTrialAgentUnits(uint8 agentUnits) external onlyRole(AGENT_ADMIN_ROLE) {
        if (agentUnits == 0) revert ZeroAmount("agentUnits");
        if (agentUnits > MAX_FREE_TRIAL_AGENT_UNITS) revert FreeTrialUnitsExceedsMax(MAX_FREE_TRIAL_AGENT_UNITS, agentUnits);
        if (_freeTrialAgentUnits == agentUnits) revert ValueAlreadySet(agentUnits);
        _freeTrialAgentUnits = agentUnits;
        emit FreeTrailAgentUnitsUpdated(agentUnits);
    }

    /**
     * @notice Fetch the amount of active agent units a given agent uses/requires.
     * @dev does nothing in this contract.
     * @param agentId ERC721 token id of given agent.
     * @return Amount of agent units the given agent uses/requires
     */
    function existingAgentActiveUnitUsage(uint256 agentId) public view virtual returns (uint256) {}

    /**
     * @notice Updates an agent's status to indicate it is a participant
     * in the execution fees system.
     * @param agentId ERC721 token id of the agent.
     * @param newMetadata IPFS pointer to agent's metadata JSON.
     * @param newChainIds ordered list of chainIds where the agent wants to run.
     * @param newRedundancy Level of redundancy for the agent.
     * @param newShards Amount of shards for the the agent.
     */
    function _afterAgentUpdate(
        uint256 agentId,
        string memory newMetadata,
        uint256[] calldata newChainIds,
        uint8 newRedundancy,
        uint8 newShards
    ) internal virtual override(AgentRegistryCore) {
        super._afterAgentUpdate(agentId, newMetadata, newChainIds, newRedundancy, newShards);

        if(!isAgentUtilizingAgentUnits(agentId)) {
            // Passing `1` since each agent will only
            // have one `key` in its BitMap
            _isAgentUtilizingAgentUnits[agentId].setTo(1, true);
            emit AgentOnExecutionFeesSystem(agentId);
        }
    }

    /**
     * @notice Function called during enabling of an agent
     * that updates an agent to be a participant in the execution
     * fees system.
     * @param agentId ERC721 token id of the agent.
     * @param permission the sender claims to have to enable the agent.
     * @param value true if enabling, false if disabling.
     */
    function _afterAgentEnable(uint256 agentId, Permission permission, bool value) internal virtual override {
        super._afterAgentEnable(agentId, permission, value);

        if(value && !isAgentUtilizingAgentUnits(agentId)) {
            // Passing `1` since each agent will only
            // have one `key` in its BitMap
            _isAgentUtilizingAgentUnits[agentId].setTo(1, true);
            emit AgentOnExecutionFeesSystem(agentId);
        }
    }
    
    /**
     * @notice Function that checks whether an agent and/or owner meets certain criteria
     * to bypass the need for agent units.
     * Criteria: agent is marked a public good, or if
     * needed agent units for the agent is under free trial threshold.
     * @param account Address of agent owner.
     * @param agentId ERC721 token id of existing agent to be "migrated" to execution fees system.
     * @param amount Agent units needed.
     * @return bool indicating whether the specific agent requires agent units
     */
    function _agentBypassesAgentUnitsRequirement(address account, uint256 agentId, uint256 amount) internal virtual override returns(bool) {
        super._agentBypassesAgentUnitsRequirement(account, agentId, amount);

        // Passing `1` to `setTo` since each agent
        // will only have one `key` in its BitMap
        if(amount <= _freeTrialAgentUnits) {
            if(!isAgentPartOfFreeTrial(agentId)) { _isAgentPartOfFreeTrial[agentId].setTo(1, true); }
            return true;
        }
        if(isPublicGoodAgent(agentId)) {
            _isAgentPartOfFreeTrial[agentId].setTo(1, false);
            return true;
        }
        
        _isAgentPartOfFreeTrial[agentId].setTo(1, false);
        return false;
    }

    /**
     * @notice Internal function that updates an agent's owner balance of active agent units
     * depending on whether an agent is created, updated, disabled, or enabled.
     * @dev Calls updateOwnerActiveBotUnits in BotUnits, which this contract has access to.
     * @param account Owner of agent being modified.
     * @param agentId ERC721 token id of existing agent to be modified.
     * @param agentUnits Amount of agent units required.
     * @param agentMod Modification being done to the agent: create, update, disable, or enable.
     */
    function _activeAgentUnitsBalanceUpdate(address account, uint256 agentId, uint256 agentUnits, AgentModification agentMod) internal virtual override {
        super._activeAgentUnitsBalanceUpdate(account, agentId, agentUnits, agentMod);
        
        if(agentMod == AgentModification.Create || agentMod == AgentModification.Enable) {
            _botUnits.updateOwnerActiveBotUnits(account, agentUnits, true);
        } else if (agentMod == AgentModification.Disable) {
            _botUnits.updateOwnerActiveBotUnits(account, agentUnits, false);
        } else if (agentMod == AgentModification.Update) {
            uint256 existingAgentUnitsUsage = existingAgentActiveUnitUsage(agentId);
            bool balanceIncreasing;
            uint256 agentUnitsForUpdate;
            if(agentUnits >= existingAgentUnitsUsage) {
                balanceIncreasing = true;
                agentUnitsForUpdate = agentUnits - existingAgentUnitsUsage;
            } else {
                balanceIncreasing = false;
                agentUnitsForUpdate = existingAgentUnitsUsage - agentUnits;
            }
            _botUnits.updateOwnerActiveBotUnits(account, agentUnitsForUpdate, balanceIncreasing);
        }
    }

    /**
     * @notice Check if agent is enabled
     * @dev first checking if agent is registered
     * so as to not fail when calling `ownerOf` on
     * an invalid ERC721.
     * @param agentId ERC721 token id of the agent.
     * @return true if agent has been registered,
     * agent owner has a valid key in either subscription plan,
     * agent has not been disabled, is staked over minimum,
     * and is a participant in the execution fees system.
     * Returns false if otherwise
     */
    function isEnabled(uint256 agentId) public view virtual override returns (bool) {
        super.isEnabled(agentId);

        if (isRegistered(agentId)) {
            if (block.timestamp > _executionFeesStartTime) {
                address agentOwner = super.ownerOf(agentId);
                return (
                    _botUnits.isOwnerInGoodStanding(agentOwner) &&
                    getDisableFlags(agentId) == 0 &&
                    (!_isStakeActivated() || _isStakedOverMin(agentId)) &&
                    isAgentUtilizingAgentUnits(agentId)
                );
            } else {
                return (
                    getDisableFlags(agentId) == 0 &&
                    (!_isStakeActivated() || _isStakedOverMin(agentId))
                );
            }
        } else {
            return false;
        }
    }

    /**
     * @notice Internal getter for when bot execution fees goes live
     * @return uint256 timestamp of when bot execution fees goes live
     */
    function getExecutionFeesStartTime() public view returns (uint256) {
        return _executionFeesStartTime;
    }

    /**
     * @notice Getter informing whether a specific agent is a public good.
     * @param agentId ERC721 token id of agent.
     * @return bool indicating whether the specific agent is a public good or not
     */
    function isPublicGoodAgent(uint256 agentId) public view returns(bool) {
        // Passing `1` since that
        // is what we set it with
        return _isAgentPublicGood[agentId].get(1);
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
        // Passing `1` since that
        // is what we set it with
        return _isAgentPartOfFreeTrial[agentId].get(1);
    }
    
    /**
     * @notice Getter returning whether or not a specific agent is a participant
     * in the execution fees system.
     * @param agentId ERC721 token id of agent.
     * @return bool indicating whether or not the given agent has migrated.
     */
    function isAgentUtilizingAgentUnits(uint256 agentId) public view returns (bool) {
        // Passing `1` since that
        // is what we set it with
        return _isAgentUtilizingAgentUnits[agentId].get(1);
    }

    /**
     *  50
     * - 1 _freeTrialAgentUnits
     * - 1 _executionFeesStartTime
     * - 1 _botUnits
     * - 1 _isAgentPublicGood
     * - 1 _isAgentPartOfFreeTrial
     * - 1 _isAgentUtilizingAgentUnits
     * --------------------------
     *  44 __gap
     */
    uint256[44] private __gap;
}