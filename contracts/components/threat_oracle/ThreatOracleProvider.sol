// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "./IThreatOracle.sol";

/**
 * Abstract contract to be _inherited_ by a protocol contract that implements the modifiers
 * that will 'consult' the deployed `ThreatOracle` contract and determine whether a given
 * account has been flagged as an exploitative account.
 * 
 * To properly use the `onlyNonExploitAccount` modifier:
 * 1. Contract will inherit `ThreatOracleProvider`
 * 2. Contract will pass the address of the deployed `ThreatOracle` in the contractructor
 * 3. Contract will add `onlyNonExploit` to the desired functions for each desired
 *    account (i.e. address). For example:
 *    `onlyNonExploitAccount(msg.sender) onlyNonExploitAccount(tx.origin)` to check
 *    both `msg.sender` and `tx.origin`. Additional ones can be added for arguments
 *    of type `address`.
 */
abstract contract ThreatOracleProvider {
    bytes32 constant private EXPLOIT_CATEGORY = keccak256("exploit");
    bytes32 constant private MEV_CATEGORY = keccak256("mev");
    uint8 constant MIN_CONFIDENCESCORE = 90;

    IThreatOracle private _threatOracle;

    error ThreatAccountIdentified(address account, string threatCategory, uint8 confidenceScore);

    modifier onlyNonExploitAccount(address account) {
        _checkAccount(account);
        _;
    }

    constructor(address __threatOracle) {
        _threatOracle = IThreatOracle(__threatOracle);
    }

    function _checkAccount(address account) internal view {
        (string memory category, uint8 confidenceScore) = _threatOracle.getThreatProperties(account);
        bytes32 categoryHashed = keccak256(abi.encodePacked(category));

        if ((categoryHashed == EXPLOIT_CATEGORY || categoryHashed == MEV_CATEGORY) && 
            confidenceScore >= MIN_CONFIDENCESCORE
        ) revert ThreatAccountIdentified(account, category, confidenceScore);
    }
}