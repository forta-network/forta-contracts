// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "./IThreatOracle.sol";

/**
 * Abstract contract to be _inherited_ by a protocol contract that implements the modifiers
 * that will 'consult' the deployed `ThreatOracle` contract and determine whether the given
 * account(s) has/have been flagged as a threat(s).
 * 
 * To properly use the provided modifiers:
 * 1. Contract will inherit `ThreatOracleProvider`
 * 2. Contract will pass the follwing in the constructor:
 *     - address of the deployed `ThreatOracle` by Forta
 *     - the minimum confidence score a flagged account should exceed to be blocked
 *     - the maximum amount of addresses a user can pass in an address array
 *       argument before transaction reverts. Due to it being type `uint8`, its
 *       natural upper bound is `255`. (DoS prevention)
 * 3. Contract will add the appropriate modifiers to the desired functions.
 *    A briefing about each modifier is as follows:
 *     - `onlyNonThreatMsgSenderAndTxOrigin()`: As implied by the name, this modifier
 *       checks the msg.sender and tx.origin of each transaction to a specific function.
 *       This modifier should be added to _all_ functions that require `ThreatOracle`
 *       services.
 *     - `onlyNonThreatAccount(address)` is intended to check arguments passed to a
 *       function of type `address`. If function has multiple arguments of type
 *       `address`, then modifier can be used more than once. For example:
 *       ```
 *          function foobar(
 *              address _accountOne,
 *              address _accounTwo
 *          )
 *              onlyNonThreatAccount(_accountOne)
 *              onlyNonThreatAccount(_accounTwo)
 *          { ... }
 *       ```
 *     - `onlyNonThreatAccounts(address[] memory)` is intended to check arguments
 *     - of type `address[]`. If the function has multiple arguments of this type,
 *       then the modifier can be used multiple times. For example:
 *       ```
 *          function foobar(
 *              address[] memory _accountsOne,
 *              address[] calldata _accountsTwo
 *          )
 *              onlyNonThreatAccount(_accountOne)
 *              onlyNonThreatAccount(_accounTwo)
 *          { ... }
 *       ```
 *       Additionally, this modifier implements a upper bound on `address[]` amount
 *       as a preventative technique for potential DoS attacks
 *
 */
abstract contract ThreatOracleProvider {
    bytes32 constant private EXPLOIT_CATEGORY = keccak256("exploit");
    bytes32 constant private MEV_CATEGORY = keccak256("mev");

    IThreatOracle private _threatOracle;
    uint8 private _minConfidenceScore;
    // Upper bound of addresses allowed in `address[]` argument
    // (DoS prevention)
    uint8 private _maxAddressArgumentAmount;

    error ThreatAccountIdentified(address account, string threatCategory, uint8 confidenceScore);
    error MaxAddressArgumentAmountExceeded(uint8 maxAddressArgumentAmount, uint exceedingAmount);

    modifier onlyNonThreatMsgSenderAndTxOrigin() {
        _confirmNonThreatAccount(msg.sender);
        _confirmNonThreatAccount(tx.origin);
        _;
    }

    modifier onlyNonThreatAccount(address account) {
        _confirmNonThreatAccount(account);
        _;
    }

    modifier onlyNonThreatAccounts(address[] memory accounts) {
        uint256 accountsAmount = accounts.length;
        if (accountsAmount > _maxAddressArgumentAmount) {
            revert MaxAddressArgumentAmountExceeded(_maxAddressArgumentAmount, accountsAmount);
        }

        for (uint256 i = 0; i < accountsAmount;) {
            _confirmNonThreatAccount(accounts[i]);

            unchecked {
                ++i;
            }
        }
        _;
    }

    constructor(address __threatOracle, uint8 __minConfidenceScore, uint8 __maxAddressArgumentAmount) {
        _threatOracle = IThreatOracle(__threatOracle);
        _minConfidenceScore = __minConfidenceScore;
        _maxAddressArgumentAmount = __maxAddressArgumentAmount;
    }

    function _confirmNonThreatAccount(address account) internal view {
        (string memory category, uint8 confidenceScore) = _threatOracle.getThreatProperties(account);
        bytes32 categoryHashed = keccak256(abi.encodePacked(category));

        if ((categoryHashed == EXPLOIT_CATEGORY || categoryHashed == MEV_CATEGORY) && 
            confidenceScore >= _minConfidenceScore
        ) revert ThreatAccountIdentified(account, category, confidenceScore);
    }
}