// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

uint8 constant SCANNER_SUBJECT = 0;
uint8 constant AGENT_SUBJECT = 1;

contract SubjectTypeValidator {

    error InvalidSubjectType(uint8 subjectType);

    /**
     * @dev check if `subjectType` belongs to the defined SUBJECT_TYPES
     * @param subjectType is not an enum because some contracts using subjectTypes are not
     * upgradeable (StakinEscrow)
     */
    modifier onlyValidSubjectType(uint8 subjectType) {
        if (
            subjectType != SCANNER_SUBJECT &&
            subjectType != AGENT_SUBJECT
        ) revert InvalidSubjectType(subjectType);
        _;
    }
}
