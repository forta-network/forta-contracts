// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@unlock-protocol/contracts/dist/PublicLock/IPublicLockV13.sol";

import "../BaseComponentUpgradeable.sol";
import "./IBotUnits.sol";

import "hardhat/console.sol";

/**
 * This contract serves to implement the necessary hooks from Unlock
 * to then adjust a membership owner's bot unit capacity.
 */
contract SubscriptionManager is BaseComponentUpgradeable {
    string public constant version = "0.1.0";

    uint8 constant NOT_LOCK_PLAN = 0;
    uint8 constant INDIVIDUAL_LOCK_PLAN = 1;
    uint8 constant TEAM_LOCK_PLAN = 2;

    struct SubscriptionPlan {
        IPublicLockV13 lockContract;
        uint256 botUnitsCapacity;
    }

    IBotUnits private _botUnits;
    mapping(uint8 => SubscriptionPlan) private _subscriptionPlans;

    event SubscriptionPlanUpdated(address indexed owner, address indexed subscriptionPlan);

    error LimitOneValidSubscription(address existingSubscriptionPlan, address subscriptionOwner);
    error InvalidFunctionCaller(address caller);

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
        _updateRecipientBotUnitsCapacity(recipient, purchasedPlan, nonPurchasedPlan);
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
        _updateRecipientBotUnitsCapacity(recipient, purchasedPlan, nonPurchasedPlan);
    }

    /**
     * @notice Allows the update of bot units currently in use by a specific membership owner.
     * @dev Calls into BotUnits contract, which this contract has the access to do so.
     * @param recipient Address of the membership owner.
     * @param purchasedPlan Uint8 representing the Lock plan from which the subscription was purchased from.
     * @param nonPurchasedPlan Uint8 representing the Lock plan from which the subscription was not purchased from.
     */
    function _updateRecipientBotUnitsCapacity(
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
            // to a lower capacity plan or vice versa.
            increasingBotUnitsBalance = _purchasedPlan.botUnitsCapacity > _nonPurchasedPlan.botUnitsCapacity;
        }

        _botUnits.updateOwnerBotUnitsCapacity(recipient, _purchasedPlan.botUnitsCapacity, increasingBotUnitsBalance);
        emit SubscriptionPlanUpdated(recipient, address(_purchasedPlan.lockContract));
    }

    /**
     * @notice Permission check.
     * @dev Used in lieu of onlyRole since we are checking for the two instaces of the Lock contract.
     * @param caller Calling account.
     * @return isValid Whether the caller is a valid lock plan.
     * @return purchasedPlan Uint8 representing the Lock plan from which the subscription was purchased from.
     * @return nonPurchasedPlan Uint8 representing the Lock plan from which the subscription was not purchased from.
     */
    function _isValidLockContract(address caller) private view returns (bool isValid, uint8 purchasedPlan, uint8 nonPurchasedPlan) {
        if (hasRole(INDIVIDUAL_LOCK_ADMIN_ROLE, caller)) { return (true, INDIVIDUAL_LOCK_PLAN, TEAM_LOCK_PLAN); }
        if (hasRole(TEAM_LOCK_ADMIN_ROLE, caller)) { return (true, TEAM_LOCK_PLAN, INDIVIDUAL_LOCK_PLAN); }
        // Since caller is not a valid lock plan, we return 0 for both plans.
        return (false, NOT_LOCK_PLAN, NOT_LOCK_PLAN);
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
     * - 1 _subscriptionPlans
     * --------------------------
     *  49 __gap
     */
    uint256[49] private __gap;
}