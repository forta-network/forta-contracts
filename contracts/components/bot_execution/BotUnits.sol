// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@unlock-protocol/contracts/dist/PublicLock/IPublicLockV13.sol";
import "../BaseComponentUpgradeable.sol";

/**
 * This contract serves to keep track of active and total bot units a bot owner has granted to them.
 * The total amount of bot units would depend on capacity of bot units granted by the membership NFT they own
 * and from which membership plan it was purchased. The main purpose of having this contract, is for
 * the accounting of the balances of active bot units granted to subscribing members. Active bot units represent
 * the portion of an owner’s total bot units that are currently being used by the owner’s detection bots.
 */
contract BotUnits is BaseComponentUpgradeable {
    string public constant version = "0.1.0";
    
    struct OwnerBotUnits {
        uint256 activeBotUnits;
        uint256 botUnitCapacity;
    }

    mapping(address => OwnerBotUnits) private _ownerBotUnits;

    IPublicLockV13 _individualPlan;
    IPublicLockV13 _teamPlan;

    event BotUnitsCapacityUpdated(address indexed owner, uint256 indexed newCapacity);
    event ActiveBotUnitsBalanceUpdated(address indexed owner, uint256 indexed newBalance);

    error InsufficientInactiveBotUnits(address account);
    error ValidMembershipRequired(address account);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     * @param __individualPlan The plan that grants a lower amount
     * of bot units to a subscriber
     * @param __teamPlan The plan that grants a higher amount
     * of bot units to a subscriber
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
     * @notice Updates a specific membership owner's bot units capacity.
     * @dev Role granted to SubscriptionManager contract, which confirms
     * subscription to any of the given plans and utilizes hooks from the
     * Lock contracts.
     * @param owner Owner of given subscription plan NFT.
     * @param newCapacity New capacity of maximum bot units
     * being granted to owner.
     * @param capacityIncrease Boolean determining whether to
     * increase or decrease an owner's granted bot unit capacity.
     */
    function updateOwnerBotUnitsCapacity(address owner, uint256 newCapacity, bool capacityIncrease) external onlyRole(BOT_UNITS_CAPACITY_ADMIN_ROLE) {
        if (capacityIncrease) {
            _ownerBotUnits[owner].botUnitCapacity = newCapacity;
        } else {
            uint256 currentActiveBotUnits = _ownerBotUnits[owner].activeBotUnits;
            if (newCapacity < currentActiveBotUnits) {
                revert InsufficientInactiveBotUnits(owner);
            }
            _ownerBotUnits[owner].botUnitCapacity = newCapacity;
        }
        emit BotUnitsCapacityUpdated(owner, newCapacity);
    }

    /**
     * @notice Updates a specific membership owner's active bot units currently in use.
     * @dev Role granted to AgentRegistry contract.
     * @param owner Owner of a given detection bot.
     * @param amount Active bot units amount by which
     * the owner's balance will increase or decrease.
     * @param balanceIncrease Boolean determining whether to
     * increase or decrease an owner's active bot units balance.
     */
    function updateOwnerActiveBotUnits(address owner, uint256 amount, bool balanceIncrease) external onlyRole(BOT_ACTIVE_UNITS_ADMIN_ROLE) {
        if (!_isOwnerInGoodStanding(owner)) { revert ValidMembershipRequired(owner); }

        uint256 currentActiveBotUnits = _ownerBotUnits[owner].activeBotUnits;
        uint256 updatedActiveBotUnits;
        if (balanceIncrease) {
            if ((currentActiveBotUnits + amount) > _ownerBotUnits[owner].botUnitCapacity) {
                revert InsufficientInactiveBotUnits(owner);
            }
            updatedActiveBotUnits = currentActiveBotUnits + amount;
        } else {
            updatedActiveBotUnits = currentActiveBotUnits - amount;
        }
        _ownerBotUnits[owner].activeBotUnits = updatedActiveBotUnits;
        emit ActiveBotUnitsBalanceUpdated(owner, updatedActiveBotUnits);
    }

    /**
     * @notice Check a given membership owner's bot unit capacity.
     * @param owner Owner of given subscription plan NFT.
     * @return Maximum capacity of bot units granted to owner.
     */
    function getOwnerBotUnitsCapacity(address owner) public view returns (uint256) {
        return _ownerBotUnits[owner].botUnitCapacity;
    }

    /**
     * @notice Check a given detection bot owner's active bot unit balance.
     * @param owner Owner of a given detection bot.
     * @return Amount of owner's bot units that are currently in use.
     */
    function getOwnerActiveBotUnits(address owner) public view returns (uint256) {
        return _ownerBotUnits[owner].activeBotUnits;
    }

    /**
     * @notice Check a given detection bot owner's inactive bot unit balance.
     * @param owner Owner of a given detection bot.
     * @return Amount of owner's bot units that are currently not in use.
     */
    function getOwnerInactiveBotUnits(address owner) public view returns (uint256) {
        return _ownerBotUnits[owner].botUnitCapacity - _ownerBotUnits[owner].activeBotUnits;
    }

    function _isOwnerInGoodStanding(address owner) private view returns (bool) {
        return _individualPlan.getHasValidKey(owner) || _teamPlan.getHasValidKey(owner);
    }

    /**
     * @notice Check if a given detection bot owner is in good standing.
     * i.e. has a valid key in either membership plan.
     * @dev Though we are using OR (||) and an account can only have one valid membership,
     * that is checked for, and gated, when an account purchases a membership
     * @param owner Owner of a given detection bot.
     * @return Amount of owner's bot units that are currently not in use.
     */
    function isOwnerInGoodStanding(address owner) external view returns (bool) {
        return _isOwnerInGoodStanding(owner);
    }

    /**
     *  50
     * - 1 _ownerBotUnits
     * - 1 _individualPlan
     * - 1 _teamPlan
     * --------------------------
     *  47 __gap
     */
    uint256[47] private __gap;
}