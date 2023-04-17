// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;


/**
 * @notice Functions to be implemented by a keyPurchaseHook.
 * @dev Lock hooks are configured by calling `setEventHooks` on the lock.
 */
interface ILockKeyPurchaseHook {
    /**
      * @notice Used to determine the purchase price before issueing a transaction.
      * This allows the hook to offer a discount on purchases.
      * This may revert to prevent a purchase.
      * @param from the msg.sender making the purchase
      * @param recipient the account which will be granted a key
      * @param referrer the account which referred this key sale
      * @param data arbitrary data populated by the front-end which initiated the sale
      * @return minKeyPrice the minimum value/price required to purchase a key with these settings
      * @dev the lock's address is the `msg.sender` when this function is called via
      * the lock's `purchasePriceFor` function
      */
    function keyPurchasePrice(
      address from,
      address recipient,
      address referrer,
      bytes calldata data
    ) external view
      returns (uint minKeyPrice);

    /**
      * @notice If the lock owner has registered an implementer then this hook
      * is called with every key sold.
      * @param tokenId the id of the purchased key
      * @param from the msg.sender making the purchase
      * @param recipient the account which will be granted a key
      * @param referrer the account which referred this key sale
      * @param data arbitrary data populated by the front-end which initiated the sale
      * @param minKeyPrice the price including any discount granted from calling this
      * hook's `keyPurchasePrice` function
      * @param pricePaid the value/pricePaid included with the purchase transaction
      * @dev the lock's address is the `msg.sender` when this function is called
      */
    function onKeyPurchase(
      uint tokenId,
      address from,
      address recipient,
      address referrer,
      bytes calldata data,
      uint minKeyPrice,
      uint pricePaid
    ) external;
}

contract LockKeyPurchaseHook is ILockKeyPurchaseHook {
    constructor() {
      // set USDC address as a variable
      // USDC on Polygon: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174

      // set FORT address as a variable
      // FORT on Polygon: 0x9ff62d1FC52A907B6DCbA8077c2DDCA6E6a9d3e1

      // set FORT/USDC Uniswap pool on Polygon address as a variable
      // (Need to create own FORT/USDC since one does not exist)
      // For now, can use FORT/USDC Uniswap pool on Ethereum
      // E.g. FORT/USDC on Ethereum mainnet: 0x1673888242BaD06Cc87A7BcaFf392Cb27218b3e3
    }

    // Function gets called inside `purchasePriceFor` function
    // and returns the price used by `onKeyPurchase` function
    function keyPurchasePrice(
        address from,
        address recipient,
        address referrer,
        bytes calldata data
    ) external view override returns (uint minKeyPrice) {
        minKeyPrice = 0;
    }

    // Will be called in the process of buying a key
    // ;;; Add access control to this function to the specific lock contract
    // role could be `LOCK_MANAGER` ;;;
    function onKeyPurchase(
        uint tokenId,
        address from,
        address recipient,
        address referrer,
        bytes calldata data,
        uint minKeyPrice,   // 
        uint pricePaid      // amount of USDC paid for the key
    ) external override {
        // If `pricePaid` is greater than the lock contract's balance of USDC, `continue` Solidity equivalent
        // (don't want to revert txn, but simply continue to next item in iteration)
        // ;;; could `_values` from the `purchase` function in a lock different in value from one to the next?
        // If not, should be able to remove this check. _But_, we can err on the side of caution in case of an unexpected
        // passing of arguments ;;;


        // Call `swap` on the FORT/USDC pool. Args:
        // `recipient` - `from`, since it is msg.sender, which would be the Lock contract
        // ;;; Confirm this is where we want funds to sent. As well as confirm we are able
        // to retrieve tokens FORT tokens from the Lock contract. Currently, the withdraw
        // contract only allows `withdraw()` to withdraw the token that is set under `tokenAddress`;;;
        // `zeroForONe` - depends on which token is `token0` and which is `token1`.
        // `amountSpecified` - `pricePaid`
        // `sqrtPriceLimitX96` - Look into this
        // `data` - Look into this
    }
}