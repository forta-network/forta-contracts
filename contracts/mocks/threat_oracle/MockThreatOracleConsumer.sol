// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../../components/threat_oracle/IThreatOracle.sol";

contract MockThreatOracleConsumer {
    bytes32 constant private EXPLOIT_CATEGORY = keccak256("exploit");
    bytes32 constant private MEV_CATEGORY = keccak256("mev");
    uint8 constant MIN_CONFIDENCESCORE = 90;

    IThreatOracle private _threatOracle;

    error ThreatAccountIdentified(address account, string threatCategory, uint8 confidenceScore);

    modifier checkAccount(address account) {
        (string memory category, uint8 confidenceScore) = _threatOracle.getThreatProperties(account);
        if (
            (keccak256(abi.encodePacked(category)) == EXPLOIT_CATEGORY ||
            keccak256(abi.encodePacked(category)) == MEV_CATEGORY) && 
            confidenceScore >= MIN_CONFIDENCESCORE
        ) revert ThreatAccountIdentified(account, category, confidenceScore);
        _;
    }

    constructor(address __threatOracle) {
        _threatOracle = IThreatOracle(__threatOracle);
    }

    function foo() public view checkAccount(msg.sender) returns (bool) {
        return true;
    }
}