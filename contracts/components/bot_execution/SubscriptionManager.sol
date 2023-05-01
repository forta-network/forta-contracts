// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

interface ILock {
    function keyPrice() external view returns (uint);
    
    /**
    * Checks if the user has a non-expired key.
    * @param _user The address of the key owner
    */
    function getHasValidKey(
        address _user
    ) external view returns (bool);

    /**
    * Returns the number of keys owned by `_keyOwner` (expired or not)
    * @param _keyOwner address for which we are retrieving the total number of keys
    * @return numberOfKeys total number of keys owned by the address
    */
    function totalKeys(
        address _keyOwner
    ) external view returns (uint numberOfKeys);
}

interface IBotUnits {
    function updateOwnerBotUnitsCapacity(address owner, uint256 amount, bool balanceIncrease) external;
}

/**
 * TODO
 * 1) Look into if msg.sender of a key purchase could be a meta-transaction forwarder.
 * If so, we need to use _msgSender() instead of msg.sender.
 * 2) If a key purchaser owns a key in the other lock plan, should we cancel the other key?
 * For now, they will simply be reverted. This of course is an issue, because it will only allow
 * purchasers who don't have a key or have an invalid key to purchase a key
 */

contract SubscriptionManager {

    struct SubscriptionPlan {
        ILock lockContract;
        uint256 botUnitsCapacity;
    }

    // Names TBD
    uint8 constant INDIVIDUAL_LOCK_PLAN = 1;
    uint8 constant TEAM_LOCK_PLAN = 2;
    mapping(uint8 => SubscriptionPlan) private _subscriptionPlans;
    IBotUnits private immutable _botUnits;

    error LimitOneValidSubscription();

    constructor(
        address __individualLockPlan,
        uint256 __individualLockCapacity,
        uint256 __teamLockCapacity,
        address __teamLockPlan,
        address __botUnits
    ) {
        _subscriptionPlans[INDIVIDUAL_LOCK_PLAN] = SubscriptionPlan(ILock(__individualLockPlan), __individualLockCapacity);
        _subscriptionPlans[TEAM_LOCK_PLAN] = SubscriptionPlan(ILock(__teamLockPlan), __teamLockCapacity);
        _botUnits = IBotUnits(__botUnits);
    }

    function _onKeyReceipt(address lockMsgSender, address keyRecipient) private {
        SubscriptionPlan memory _individualPlan = _subscriptionPlans[INDIVIDUAL_LOCK_PLAN];
        SubscriptionPlan memory _teamPlan = _subscriptionPlans[TEAM_LOCK_PLAN];

        if(lockMsgSender == address(_individualPlan.lockContract)) {
            _updateKeyRecipientBotUnitsCapacity(keyRecipient, _individualPlan, _teamPlan);
        }

        if(lockMsgSender == address(_teamPlan.lockContract)) {
            _updateKeyRecipientBotUnitsCapacity(keyRecipient, _teamPlan, _individualPlan);
        }
    }

    function _updateKeyRecipientBotUnitsCapacity(
        address keyRecipient,
        SubscriptionPlan memory purchasedPlan,
        SubscriptionPlan memory nonPurchasedPlan
    ) private {
        if (nonPurchasedPlan.lockContract.getHasValidKey(keyRecipient)) { revert LimitOneValidSubscription(); }

        bool increasingBotUnitsBalance;
        if(nonPurchasedPlan.lockContract.totalKeys(keyRecipient) == 0) {
            // Increasing bot units balance because
            // they don't have a subscription with
            // with either plan. Valid or otherwise.
            increasingBotUnitsBalance = true;
        } else {
            // Determining whether they're going from a plan with higher bot units capacity
            // to a lower capacity plan or vice versa.
            increasingBotUnitsBalance = purchasedPlan.botUnitsCapacity > nonPurchasedPlan.botUnitsCapacity;
        }

        _botUnits.updateOwnerBotUnitsCapacity(keyRecipient, purchasedPlan.botUnitsCapacity, increasingBotUnitsBalance);
    }

    function onKeyPurchase(
        uint tokenId,
        address from,
        address recipient,
        address referrer,
        bytes calldata data,
        uint minKeyPrice,
        uint pricePaid
    ) external {
        _onKeyReceipt(msg.sender, recipient);
    }

    function onKeyGranted(
        uint tokenId,
        address from,
        address recipient,
        address keyManager,
        uint expiration
    ) external {
        _onKeyReceipt(msg.sender, recipient);
    }
  
    function keyPurchasePrice(
        address from,
        address recipient,
        address referrer,
        bytes calldata data
    ) external view returns (uint minKeyPrice) {
        return ILock(msg.sender).keyPrice();
    }
}