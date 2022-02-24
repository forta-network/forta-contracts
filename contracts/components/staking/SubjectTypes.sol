// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

uint8 constant SCANNER_SUBJECT = 0;
uint8 constant AGENT_SUBJECT = 1;

contract SubjectTypeValidator {

    // @dev: not a modifier for contract size reasons
    function  _onlyValidSubjectType(uint8 subjectType) pure internal {
        require(
            subjectType == SCANNER_SUBJECT ||
            subjectType == AGENT_SUBJECT,
            "STV: invalid subjectType"
        );
    }
}
