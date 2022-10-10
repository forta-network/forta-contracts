// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

uint8 constant SCANNER_SUBJECT = 0;
uint8 constant AGENT_SUBJECT = 1;
uint8 constant NODE_RUNNER_SUBJECT = 2;

contract SubjectTypeValidator {

    enum SubjectStakeAgency {
        UNDEFINED,
        MANAGED,
        DIRECT,
        DELEGATED,
        DELEGATOR
    }

    error InvalidSubjectType(uint8 subjectType);
    error ForbiddenForManagedType(uint8 subjectType);

    /**
     * @dev check if `subjectType` belongs to the defined SUBJECT_TYPES
     * @param subjectType is not an enum because some contracts using subjectTypes are not
     * upgradeable (StakingEscrow)
     */
    modifier onlyValidSubjectType(uint8 subjectType) {
        if (
            subjectType != SCANNER_SUBJECT &&
            subjectType != AGENT_SUBJECT &&
            subjectType != NODE_RUNNER_SUBJECT
        ) revert InvalidSubjectType(subjectType);
        _;
    }

    modifier notManagedType(uint8 subjectType) {
        if (getSubjectTypeAgency(subjectType) == SubjectStakeAgency.MANAGED) revert ForbiddenForManagedType(subjectType);
        _;
    }

    function getSubjectTypeAgency(uint8 subjectType) public pure returns(SubjectStakeAgency) {
        if (subjectType == SCANNER_SUBJECT) {
            return SubjectStakeAgency.MANAGED;
        } else if (subjectType == AGENT_SUBJECT) {
            return SubjectStakeAgency.DIRECT;
        } else if (subjectType == NODE_RUNNER_SUBJECT) {
            return SubjectStakeAgency.DELEGATED;
        }
        return SubjectStakeAgency.UNDEFINED;
    }




}
