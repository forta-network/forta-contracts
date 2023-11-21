// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

interface IThreatOracle {
    struct ThreatProperties { string category; uint8 confidenceScore; }

    function registerAccounts(address[] calldata accounts, string[] calldata categories, uint8[] calldata confidenceScores) external;
    function deregisterAccounts(address[] calldata accounts) external;
    function getThreatProperties(address account) external view returns (string memory category, uint8 confidenceScore);
}