// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@unlock-protocol/contracts/dist/PublicLock/IPublicLockV13.sol";
import "../../errors/GeneralErrors.sol";

import "../BaseComponentUpgradeable.sol";
import "./IBotUnits.sol";

import "hardhat/console.sol";

uint8 constant INVALID_LOCK_PLAN = 0;
uint8 constant INDIVIDUAL_LOCK_PLAN = 1;
uint8 constant TEAM_LOCK_PLAN = 2;

/**
 * This contract serves to implement the necessary hooks from Unlock
 * to then adjust a membership owner's bot unit capacity.
 */
contract SubscriptionManager is BaseComponentUpgradeable {
    string public constant version = "0.1.0";

    struct SubscriptionPlan {
        IPublicLockV13 lockContract;
        uint256 botUnitsCapacity;
    }

    IBotUnits private _botUnits;
    mapping(uint8 => SubscriptionPlan) private _subscriptionPlans;

    event SubscriptionPlanUpdated(address indexed subscriptionPlan, uint256 botUnitsCapacity, uint8 subscriptionPlanId);
    event BotUnitsContractUpdated(address indexed botUnitsContract);

    error InvalidSubscriptionPlanId(uint8 invalidId);
    error LimitOneValidSubscription(address existingSubscriptionPlan, address subscriptionOwner);
    error InvalidFunctionCaller(address caller);
    error MustHaveNoActiveBotUnits(address keySender);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder)  {}

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     */
    function initialize(
        address __manager,
        address __individualLockAddress,
        uint256 __individualLockBotUnitsCapacity,
        address __teamLockAddress,
        uint256 __teamLockBotUnitsCapacity,
        address __botUnits
    ) public initializer {
        __BaseComponentUpgradeable_init(__manager);
        _subscriptionPlans[INDIVIDUAL_LOCK_PLAN] = SubscriptionPlan({
            lockContract: IPublicLockV13(__individualLockAddress),
            botUnitsCapacity: __individualLockBotUnitsCapacity
        });
        _subscriptionPlans[TEAM_LOCK_PLAN] = SubscriptionPlan({
            lockContract: IPublicLockV13(__teamLockAddress),
            botUnitsCapacity: __teamLockBotUnitsCapacity
        });
        _botUnits = IBotUnits(__botUnits);
    }

    /**
     * @dev allows SUBSCRIPTION_ADMIN_ROLE to update a subscription plan
     * for the bot execution fees
     * @param subscriptionPlan The plan being updated
     * @param botUnitsCapacity The about of total bot units that would
     * be granted to a suscriber to the plan
     * @param subscriptionPlanId An identifier used to know which plan
     * is the one being updated. Has to equal to either INDIVIDUAL_LOCK_PLAN
     * or TEAM_LOCK_PLAN.
     */
    function setSubscriptionPlan(address subscriptionPlan, uint256 botUnitsCapacity, uint8 subscriptionPlanId) external onlyRole(SUBSCRIPTION_ADMIN_ROLE) {
        if ((subscriptionPlanId != INDIVIDUAL_LOCK_PLAN) && (subscriptionPlanId != TEAM_LOCK_PLAN)) revert InvalidSubscriptionPlanId(subscriptionPlanId);
        if (subscriptionPlan == address(0)) revert ZeroAddress("subscriptionPlan");
        if (botUnitsCapacity == 0) revert ZeroAmount("botUnitsCapacity");

        _subscriptionPlans[subscriptionPlanId] = SubscriptionPlan({
            lockContract: IPublicLockV13(subscriptionPlan),
            botUnitsCapacity: botUnitsCapacity
        });
        emit SubscriptionPlanUpdated(subscriptionPlan, botUnitsCapacity, subscriptionPlanId);
    }

    /**
     * @dev allows SUBSCRIPTION_ADMIN_ROLE to set the contract that will
     * handle the accounting for bot units for a subscriber.
     * @param botUnits The contract that will handle
     * the bot unit accounting
     */
    function setBotUnits(address botUnits) external onlyRole(SUBSCRIPTION_ADMIN_ROLE) {
        if (botUnits == address(0)) revert ZeroAddress("botUnits");

        _botUnits = IBotUnits(botUnits);
        emit BotUnitsContractUpdated(botUnits);
    }

    /**
     * @notice Hook implementation that triggers when a key is purchased. Updates the
     * key recipient's bot units capacity based on the purchased plan.
     * @param recipient the account which will be granted a key
     * @dev the lock's address is the `msg.sender` when this function is called
     */
    function onKeyPurchase(
        uint /*tokenId*/,
        address /*from*/,
        address recipient,
        address /*referrer*/,
        bytes calldata /*data*/,
        uint /*minKeyPrice*/,
        uint /*pricePaid*/
    ) external {
        (bool isValid, uint8 purchasedPlan, uint8 nonPurchasedPlan) = _isValidLockContract(msg.sender);
        if (!isValid) revert InvalidFunctionCaller(msg.sender);
        _updateKeyRecipientBotUnitsCapacity(recipient, purchasedPlan, nonPurchasedPlan);
    }

    /**
     * @notice Hook implementation that triggers when a key is granted. Updates the
     * key recipient's bot units capacity based on the purchased plan.
     * @param recipient the account which will be granted a key
     * @dev the lock's address is the `msg.sender` when this function is called
     */
    function onKeyGranted(
        uint /*tokenId*/,
        address /*from*/,
        address recipient,
        address /*keyManager*/,
        uint /*expiration*/
    ) external {
        (bool isValid, uint8 purchasedPlan, uint8 nonPurchasedPlan) = _isValidLockContract(msg.sender);
        if (!isValid) revert InvalidFunctionCaller(msg.sender);
        _updateKeyRecipientBotUnitsCapacity(recipient, purchasedPlan, nonPurchasedPlan);
    }

    /**
     * @notice If the lock owner has registered an implementer then this hook
     * is called every time balanceOf is called
     * @param from the previous owner of transferred key
     * @param to the new owner of the key
     */
    function onKeyTransfer(
        address /*lockAddress*/,
        uint /*tokenId*/,
        address /*operator*/,
        address from,
        address to,
        uint /*expirationTimestamp*/
    ) external {
        (bool isValid, uint8 purchasedPlan, uint8 nonPurchasedPlan) = _isValidLockContract(msg.sender);
        if (!isValid) revert InvalidFunctionCaller(msg.sender);

        uint256 fromActiveBotUnits = _botUnits.getOwnerActiveBotUnits(from);
        if (fromActiveBotUnits > 0) revert MustHaveNoActiveBotUnits(from);

        _botUnits.updateOwnerBotUnitsCapacity(from, 0, false);
        _updateKeyRecipientBotUnitsCapacity(to, purchasedPlan, nonPurchasedPlan);
    }

    /**
     * @notice Updates bot units capacity granted to a specific membership owner.
     * @dev Calls into BotUnits contract, which this contract has the access to do so.
     * @param recipient Address of the membership owner.
     * @param purchasedPlan Uint8 representing the Lock plan from which the subscription WAS purchased from.
     * @param nonPurchasedPlan Uint8 representing the Lock plan from which the subscription WAS NOT purchased from.
     */
    function _updateKeyRecipientBotUnitsCapacity(
        address recipient,
        uint8 purchasedPlan,
        uint8 nonPurchasedPlan
    ) private {
        SubscriptionPlan memory _purchasedPlan = _subscriptionPlans[purchasedPlan];
        SubscriptionPlan memory _nonPurchasedPlan = _subscriptionPlans[nonPurchasedPlan];

        if (_nonPurchasedPlan.lockContract.getHasValidKey(recipient)) {
            revert LimitOneValidSubscription(address(_nonPurchasedPlan.lockContract), recipient);
        }

        bool increasingBotUnitsBalance;
        if(_nonPurchasedPlan.lockContract.totalKeys(recipient) == 0) {
            // Increasing bot units balance because
            // recipient doesn't have a subscription with
            // with either plan. Valid or otherwise.
            increasingBotUnitsBalance = true;
        } else {
            // Determining whether they're going from a plan with higher bot units capacity
            // to a lower capacity plan and vice versa.
            increasingBotUnitsBalance = _purchasedPlan.botUnitsCapacity > _nonPurchasedPlan.botUnitsCapacity;
        }

        _botUnits.updateOwnerBotUnitsCapacity(recipient, _purchasedPlan.botUnitsCapacity, increasingBotUnitsBalance);
    }

    /**
     * @notice Permission check.
     * @dev Used in lieu of onlyRole since we are checking for the two instaces of the Lock contract.
     * @param caller Calling Lock contract.
     * @return isValid Whether the caller is a valid Lock plan.
     * @return purchasedPlan Uint8 representing the Lock plan from which the subscription was purchased from.
     * @return nonPurchasedPlan Uint8 representing the Lock plan from which the subscription was not purchased from.
     */
    function _isValidLockContract(address caller) private view returns (bool isValid, uint8 purchasedPlan, uint8 nonPurchasedPlan) {
        if (hasRole(INDIVIDUAL_LOCK_ROLE, caller)) { return (true, INDIVIDUAL_LOCK_PLAN, TEAM_LOCK_PLAN); }
        if (hasRole(TEAM_LOCK_ROLE, caller)) { return (true, TEAM_LOCK_PLAN, INDIVIDUAL_LOCK_PLAN); }
        // Since caller is not a valid lock plan, we return 0 for both plans.
        return (false, INVALID_LOCK_PLAN, INVALID_LOCK_PLAN);
    }
  
    /**
     * @notice Fetches the key price for the calling Lock contract.
     * @dev the lock's address is the `msg.sender` when this function is called via
     * the lock's `purchasePriceFor` function. Necessary to implement to adhere to the interface.
     */
    function keyPurchasePrice(
        address /*from*/,
        address /*recipient*/,
        address /*referrer*/,
        bytes calldata /*data*/
    ) external view returns (uint minKeyPrice) {
        (bool isValid,,) = _isValidLockContract(msg.sender);
        if (!isValid) revert InvalidFunctionCaller(msg.sender);
        return IPublicLockV13(msg.sender).keyPrice();
    }

    /**
     *  50
     * - 1 _botUnits
     * - 1 _subscriptionPlans
     * --------------------------
     *  48 __gap
     */
    uint256[48] private __gap;
}