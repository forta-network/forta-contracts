// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.4;

// These are the identifiers for slash reasons. Update this file if new slash reasons are configured, for
// better reference.

bytes32 constant OPERATIONAL_SLASH = keccak256("OPERATIONAL_SLASH");
bytes32 constant MALICIOUS_SUBJECT_SLASH = keccak256("MALICIOUS_SUBJECT_SLASH");