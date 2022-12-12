// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

uint8 constant UNDEFINED_SUBJECT = 255;
uint8 constant SCANNER_SUBJECT = 0;
uint8 constant AGENT_SUBJECT = 1;
uint8 constant SCANNER_POOL_SUBJECT = 2;
uint8 constant DELEGATOR_SCANNER_POOL_SUBJECT = 3;

/**
 * Defines the types of staking Subject Types, their agency and relationships.
 * There are different types of subject type agency:
 * - MANAGED --> Cannot be staked on directly, allocation of stake is controlled by their manager, a DELEGATED type
 * - DIRECT --> Can be staked on by multiple different stakers
 * - DELEGATED --> Can be staked on by the owner of the relevant Registry entry. Manages MANAGED subjects.
 * - DELEGATOR --> TBD
 *
 * The current Subject Types and their Agency:
 * - SCANNER_SUBJECT --> MANAGED
 * - AGENT_SUBJECT (detection bots) --> DIRECT
 * - SCANNER_POOL_SUBJECT --> DELEGATED
 *
 */
contract SubjectTypeValidator {
    enum SubjectStakeAgency {
        UNDEFINED,
        DIRECT,
        DELEGATED,
        DELEGATOR,
        MANAGED
    }

    error InvalidSubjectType(uint8 subjectType);
    error ForbiddenForType(uint8 subjectType, SubjectStakeAgency provided, SubjectStakeAgency expected);

    /**
     * @dev check if `subjectType` belongs to the defined SUBJECT_TYPES
     * @param subjectType is not an enum because some contracts using subjectTypes are not
     * upgradeable (StakingEscrow)
     */
    modifier onlyValidSubjectType(uint8 subjectType) {
        if (subjectType != SCANNER_SUBJECT && subjectType != AGENT_SUBJECT && subjectType != SCANNER_POOL_SUBJECT && subjectType != DELEGATOR_SCANNER_POOL_SUBJECT)
            revert InvalidSubjectType(subjectType);
        _;
    }

    modifier onlyAgencyType(uint8 subjectType, SubjectStakeAgency expected) {
        if (getSubjectTypeAgency(subjectType) != expected) revert ForbiddenForType(subjectType, getSubjectTypeAgency(subjectType), expected);
        _;
    }

    modifier notAgencyType(uint8 subjectType, SubjectStakeAgency forbidden) {
        if (getSubjectTypeAgency(subjectType) == forbidden) revert ForbiddenForType(subjectType, getSubjectTypeAgency(subjectType), forbidden);
        _;
    }

    function getSubjectTypeAgency(uint8 subjectType) public pure returns (SubjectStakeAgency) {
        if (subjectType == AGENT_SUBJECT) {
            return SubjectStakeAgency.DIRECT;
        } else if (subjectType == SCANNER_POOL_SUBJECT) {
            return SubjectStakeAgency.DELEGATED;
        } else if (subjectType == DELEGATOR_SCANNER_POOL_SUBJECT) {
            return SubjectStakeAgency.DELEGATOR;
        } else if (subjectType == SCANNER_SUBJECT) {
            return SubjectStakeAgency.MANAGED;
        }
        return SubjectStakeAgency.UNDEFINED;
    }

    function getDelegatorSubjectType(uint8 subjectType) public pure returns (uint8) {
        if (subjectType == SCANNER_POOL_SUBJECT) {
            return DELEGATOR_SCANNER_POOL_SUBJECT;
        }
        return UNDEFINED_SUBJECT;
    }

    function getDelegatedSubjectType(uint8 subjectType) public pure returns (uint8) {
        if (subjectType == DELEGATOR_SCANNER_POOL_SUBJECT) {
            return SCANNER_POOL_SUBJECT;
        }
        return UNDEFINED_SUBJECT;
    }
}
