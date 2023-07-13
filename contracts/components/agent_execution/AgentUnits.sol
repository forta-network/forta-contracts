// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@unlock-protocol/contracts/dist/PublicLock/IPublicLockV13.sol";
import "../BaseComponentUpgradeable.sol";

/**
 * This contract serves to keep track of active and total agent units an agent owner has granted to them.
 * The total amount of agent units would depend on capacity of agent units granted by the membership NFT they own
 * and from which membership plan it was purchased. The main purpose of having this contract, is for
 * the accounting of the balances of active agent units granted to subscribing members. Active agent units represent
 * the portion of an owner’s total agent units that are currently being used by the owner’s detection agents.
 */
contract AgentUnits is BaseComponentUpgradeable {
    string public constant version = "0.1.0";
    
    struct OwnerAgentUnits {
        uint256 activeAgentUnits;
        uint256 agentUnitCapacity;
    }

    mapping(address => OwnerAgentUnits) private _ownerAgentUnits;

    IPublicLockV13 _individualPlan;
    IPublicLockV13 _teamPlan;

    event AgentUnitsCapacityUpdated(address indexed owner, uint256 indexed newCapacity);
    event ActiveAgentUnitsBalanceUpdated(address indexed owner, uint256 indexed newBalance);

    error InsufficientInactiveAgentUnits(address account);
    error ValidMembershipRequired(address account);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     * @param __individualPlan The plan that grants a lower amount
     * of agent units to a subscriber
     * @param __teamPlan The plan that grants a higher amount
     * of agent units to a subscriber
     */
    function initialize(
        address __manager,
        address __individualPlan,
        address __teamPlan
    ) public initializer {
        if (__individualPlan == address(0)) revert ZeroAddress("__individualPlan");
        if (__teamPlan == address(0)) revert ZeroAddress("__teamPlan");

        __BaseComponentUpgradeable_init(__manager);
        _individualPlan = IPublicLockV13(__individualPlan);
        _teamPlan = IPublicLockV13(__teamPlan);
    }

    /**
     * @notice Updates a specific membership owner's agent units capacity.
     * @dev Role granted to SubscriptionManager contract, which confirms
     * subscription to any of the given plans and utilizes hooks from the
     * Lock contracts.
     * @param owner Owner of given subscription plan NFT.
     * @param newCapacity New capacity of maximum agent units
     * being granted to owner.
     * @param capacityIncrease Boolean determining whether to
     * increase or decrease an owner's granted agent unit capacity.
     */
    function updateOwnerAgentUnitsCapacity(address owner, uint256 newCapacity, bool capacityIncrease) external onlyRole(AGENT_UNITS_CAPACITY_ADMIN_ROLE) {
        if (capacityIncrease) {
            _ownerAgentUnits[owner].agentUnitCapacity = newCapacity;
        } else {
            uint256 currentActiveAgentUnits = _ownerAgentUnits[owner].activeAgentUnits;
            if (newCapacity < currentActiveAgentUnits) {
                revert InsufficientInactiveAgentUnits(owner);
            }
            _ownerAgentUnits[owner].agentUnitCapacity = newCapacity;
        }
        emit AgentUnitsCapacityUpdated(owner, newCapacity);
    }

    /**
     * @notice Updates a specific membership owner's active agent units currently in use.
     * @dev Role granted to AgentRegistry contract.
     * @param owner Owner of a given detection agent.
     * @param amount Active agent units amount by which
     * the owner's balance will increase or decrease.
     * @param balanceIncrease Boolean determining whether to
     * increase or decrease an owner's active agent units balance.
     */
    function updateOwnerActiveAgentUnits(address owner, uint256 amount, bool balanceIncrease) external onlyRole(AGENT_ACTIVE_UNITS_ADMIN_ROLE) {
        if (!_isOwnerInGoodStanding(owner)) { revert ValidMembershipRequired(owner); }

        uint256 currentActiveAgentUnits = _ownerAgentUnits[owner].activeAgentUnits;
        uint256 updatedActiveAgentUnits;
        if (balanceIncrease) {
            if ((currentActiveAgentUnits + amount) > _ownerAgentUnits[owner].agentUnitCapacity) {
                revert InsufficientInactiveAgentUnits(owner);
            }
            updatedActiveAgentUnits = currentActiveAgentUnits + amount;
        } else {
            updatedActiveAgentUnits = currentActiveAgentUnits - amount;
        }
        _ownerAgentUnits[owner].activeAgentUnits = updatedActiveAgentUnits;
        emit ActiveAgentUnitsBalanceUpdated(owner, updatedActiveAgentUnits);
    }

    /**
     * @notice Check a given membership owner's agent unit capacity.
     * @param owner Owner of given subscription plan NFT.
     * @return Maximum capacity of agent units granted to owner.
     */
    function getOwnerAgentUnitsCapacity(address owner) public view returns (uint256) {
        return _ownerAgentUnits[owner].agentUnitCapacity;
    }

    /**
     * @notice Check a given detection agent owner's active agent unit balance.
     * @param owner Owner of a given detection agent.
     * @return Amount of owner's agent units that are currently in use.
     */
    function getOwnerActiveAgentUnits(address owner) public view returns (uint256) {
        return _ownerAgentUnits[owner].activeAgentUnits;
    }

    /**
     * @notice Check a given detection agent owner's inactive agent unit balance.
     * @param owner Owner of a given detection agent.
     * @return Amount of owner's agent units that are currently not in use.
     */
    function getOwnerInactiveAgentUnits(address owner) public view returns (uint256) {
        return _ownerAgentUnits[owner].agentUnitCapacity - _ownerAgentUnits[owner].activeAgentUnits;
    }

    function _isOwnerInGoodStanding(address owner) private view returns (bool) {
        return _individualPlan.getHasValidKey(owner) || _teamPlan.getHasValidKey(owner);
    }

    /**
     * @notice Check if a given detection agent owner is in good standing.
     * i.e. has a valid key in either membership plan.
     * @dev Though we are using OR (||) and an account can only have one valid membership,
     * that is checked for, and gated, when an account purchases a membership
     * @param owner Owner of a given detection agent.
     * @return Amount of owner's agent units that are currently not in use.
     */
    function isOwnerInGoodStanding(address owner) external view returns (bool) {
        return _isOwnerInGoodStanding(owner);
    }

    /**
     *  50
     * - 1 _ownerAgentUnits
     * - 1 _individualPlan
     * - 1 _teamPlan
     * --------------------------
     *  47 __gap
     */
    uint256[47] private __gap;
}