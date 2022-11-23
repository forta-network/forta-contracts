// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../FortaStaking.sol";
import "./IDelegatedStakeSubject.sol";
import "./IDirectStakeSubject.sol";

/**
 * Formerly FortaStakingParameters.
 * 
 * This contract manages the relationship between the staking contracts and the several affected staking subjects,
 * who hold the responsability of defining staking thresholds, managed subjects, and related particularities.
 */
contract StakeSubjectGateway is BaseComponentUpgradeable, SubjectTypeValidator, IStakeSubjectGateway {
    FortaStaking private _fortaStaking; // Should be immutable but already deployed.
    // stake subject parameters for each subject
    /// @custom:oz-renamed-from _stakeSubjectHandlers
    /// @custom:oz-retyped-from mapping(uint8 => contract IStakeSubject)
    mapping(uint8 => address) private _stakeSubjects;

    error NonIDelegatedSubjectHandler(uint8 subjectType, address stakeSubject);

    string public constant version = "0.1.1";
    uint256 private constant MAX_UINT = 2**256 - 1;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     * @param __fortaStaking address of FortaStaking.
     */
    function initialize(address __manager, address __fortaStaking) public initializer {
        __BaseComponentUpgradeable_init(__manager);

        _setFortaStaking(__fortaStaking);
    }

    function _setFortaStaking(address newFortaStaking) internal {
        if (newFortaStaking == address(0)) revert ZeroAddress("newFortaStaking");
        _fortaStaking = FortaStaking(newFortaStaking);
    }

    /**
     * Sets stake subject for subject type.
     */
    function setStakeSubject(uint8 subjectType, address subject) external onlyRole(DEFAULT_ADMIN_ROLE) onlyValidSubjectType(subjectType) {
        if (subject == address(0)) revert ZeroAddress("subject");
        emit StakeSubjectChanged(subject, (_stakeSubjects[subjectType]));
        _stakeSubjects[subjectType] = subject;
    }

    function unsetStakeSubject(uint8 subjectType) external onlyRole(DEFAULT_ADMIN_ROLE) onlyValidSubjectType(subjectType) {
        emit StakeSubjectChanged(address(0), address(_stakeSubjects[subjectType]));
        delete _stakeSubjects[subjectType];
    }

    function getStakeSubject(uint8 subjectType) external view returns (address) {
        return _stakeSubjects[subjectType];
    }

    /**
     * Get max stake for that `subjectType` and `subject`
     * @return if subject is DIRECT, returns stakeThreshold.max, if not MAX_UINT. If subject not set, it will return 0.
     */ 
    function maxStakeFor(uint8 subjectType, uint256 subject) external view returns (uint256) {
        if (getSubjectTypeAgency(subjectType) != SubjectStakeAgency.DIRECT) {
            return MAX_UINT;
        }
        if (address(0) == _stakeSubjects[subjectType]) {
            return 0;
        }
        return IDirectStakeSubject(_stakeSubjects[subjectType]).getStakeThreshold(subject).max;

    }

    /**
     * Get min stake for that `subjectType` and `subject`
     * @return if subject is DIRECT, returns stakeThreshold.min, if not 0. If subject not set, it will return MAX_UINT.
     */ 
    function minStakeFor(uint8 subjectType, uint256 subject) external view returns (uint256) {
        if (getSubjectTypeAgency(subjectType) != SubjectStakeAgency.DIRECT) {
            return 0;
        }
        if (address(0) == _stakeSubjects[subjectType]) {
            return MAX_UINT;
        }
        return IDirectStakeSubject(_stakeSubjects[subjectType]).getStakeThreshold(subject).min;
    }

    function maxManagedStakeFor(uint8 subjectType, uint256 subject) external view returns (uint256) {
        if (getSubjectTypeAgency(subjectType) != SubjectStakeAgency.DELEGATED) {
            return MAX_UINT;
        }
        if (address(0) == _stakeSubjects[subjectType]) {
            return 0;
        }
        return IDelegatedStakeSubject(address(_stakeSubjects[subjectType])).getManagedStakeThreshold(subject).max;
    }

    function minManagedStakeFor(uint8 subjectType, uint256 subject) external view returns (uint256) {
        if (getSubjectTypeAgency(subjectType) != SubjectStakeAgency.DELEGATED) {
            return 0;
        }
        if (address(0) == _stakeSubjects[subjectType]) {
            return MAX_UINT;
        }
        return IDelegatedStakeSubject(address(_stakeSubjects[subjectType])).getManagedStakeThreshold(subject).min;
    }

    function totalManagedSubjects(uint8 subjectType, uint256 subject) external view returns (uint256) {
        if (getSubjectTypeAgency(subjectType) != SubjectStakeAgency.DELEGATED) {
            return 0;
        }
        if (address(0) == _stakeSubjects[subjectType]) {
            return 0;
        }
        return IDelegatedStakeSubject(address(_stakeSubjects[subjectType])).getTotalManagedSubjects(subject);
    }

    /// Get if staking is activated for that `subjectType` and `subject`. If not set, will return false.
    function isStakeActivatedFor(uint8 subjectType, uint256 subject) external view returns (bool) {
        if (subjectType == SCANNER_POOL_SUBJECT || subjectType == DELEGATOR_SCANNER_POOL_SUBJECT) {
            return true;
        }
        if (address(0) == _stakeSubjects[subjectType]) {
            return false;
        }
        return IDirectStakeSubject(_stakeSubjects[subjectType]).getStakeThreshold(subject).activated;
    }

    /// Gets active stake (amount of staked tokens) on `subject` id for `subjectType`
    function activeStakeFor(uint8 subjectType, uint256 subject) external view returns (uint256) {
        return _fortaStaking.activeStakeFor(subjectType, subject);
    }

    /// Gets active and inactive stake (amount of staked tokens) on `subject` id for `subjectType`
    function totalStakeFor(uint8 subjectType, uint256 subject) external view override returns (uint256) {
        return _fortaStaking.activeStakeFor(subjectType, subject) + _fortaStaking.inactiveStakeFor(subjectType, subject);
    }

    /// Checks if subject, subjectType is registered
    function isRegistered(uint8 subjectType, uint256 subject) external view returns (bool) {
        if (getSubjectTypeAgency(subjectType) == SubjectStakeAgency.DELEGATOR) {
            return true;
        }
        if (address(0) == _stakeSubjects[subjectType]) {
            return false;
        }
        return IStakeSubject(_stakeSubjects[subjectType]).isRegistered(subject);
    }

    /// Returns true if allocator owns the subject, or is the subject contract itself
    function canManageAllocation(uint8 subjectType, uint256 subject, address allocator) external view returns (bool) {
        SubjectStakeAgency agency = getSubjectTypeAgency(subjectType);
        if (agency != SubjectStakeAgency.DELEGATOR && agency != SubjectStakeAgency.DELEGATED) {
            return false;
        }
        if (address(0) == _stakeSubjects[subjectType]) {
            return false;
        }
        return IStakeSubject(_stakeSubjects[subjectType]).ownerOf(subject) == allocator || _stakeSubjects[subjectType] == allocator;
    }

    function ownerOf(uint8 subjectType, uint256 subject) external view returns (address) {
        if (address(0) == _stakeSubjects[subjectType]) {
            return address(0);
        }
        return IStakeSubject(_stakeSubjects[subjectType]).ownerOf(subject);
    }

}
