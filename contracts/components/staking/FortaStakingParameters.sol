// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "./FortaStaking.sol";
import "./IDelegatedStakeSubject.sol";
import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165CheckerUpgradeable.sol";
import "hardhat/console.sol";

contract FortaStakingParameters is BaseComponentUpgradeable, SubjectTypeValidator, IStakeSubjectHandler {

    using ERC165CheckerUpgradeable for address;

    FortaStaking private _fortaStaking;
    // stake subject parameters for each subject
    mapping(uint8 => IStakeSubject) private _stakeSubjects;

    event FortaStakingChanged(address staking);

    error NonIDelegatedSubjectHandler(uint8 subjectType, address handler);

    string public constant version = "0.1.1";
    uint256 public constant maxSlashableStakePercent = 90;


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

    /// Setter for FortaStaking implementation address.
    function setFortaStaking(address newFortaStaking) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setFortaStaking(newFortaStaking);
    }

    function _setFortaStaking(address newFortaStaking) internal {
        if (newFortaStaking == address(0)) revert ZeroAddress("newFortaStaking");
        _fortaStaking = FortaStaking(newFortaStaking);
        emit FortaStakingChanged(address(_fortaStaking));
    }

    /**
     * Sets stake subject handler stake for subject type.
     */
    function setStakeSubject(uint8 subjectType, IStakeSubject subject) external onlyRole(DEFAULT_ADMIN_ROLE) onlyValidSubjectType(subjectType) {
        if (address(subject) == address(0)) revert ZeroAddress("subject");
        emit StakeSubjectChanged(address(subject), address(_stakeSubjects[subjectType]));
        _stakeSubjects[subjectType] = subject;
    }

    function unsetStakeSubject(uint8 subjectType) external onlyRole(DEFAULT_ADMIN_ROLE) onlyValidSubjectType(subjectType) {
        emit StakeSubjectChanged(address(0), address(_stakeSubjects[subjectType]));
        delete _stakeSubjects[subjectType];
    }

    function getStakeSubject(uint8 subjectType) external view returns (IStakeSubject) {
        return _stakeSubjects[subjectType];
    }

    /// Get max stake for that `subjectType` and `subject`. If not set, will return 0.
    function maxStakeFor(uint8 subjectType, uint256 subject) external view returns (uint256) {
        return _stakeSubjects[subjectType].getStakeThreshold(subject).max;
    }

    /// Get min stake for that `subjectType` and `subject`. If not set, will return 0.
    function minStakeFor(uint8 subjectType, uint256 subject) external view returns (uint256) {
        return _stakeSubjects[subjectType].getStakeThreshold(subject).min;
    }

    function maxManagedStakeFor(uint8 subjectType, uint256 subject) external view returns (uint256) {
        return IDelegatedStakeSubject(address(_stakeSubjects[subjectType])).getManagedStakeThreshold(subject).max;
    }

    function minManagedStakeFor(uint8 subjectType, uint256 subject) external view returns (uint256) {
        return IDelegatedStakeSubject(address(_stakeSubjects[subjectType])).getManagedStakeThreshold(subject).min;
    }

    function totalManagedSubjects(uint8 subjectType, uint256 subject) external view returns (uint256) {
        return IDelegatedStakeSubject(address(_stakeSubjects[subjectType])).getTotalManagedSubjects(subject);
    }

    function allocatedStakePerManaged(uint8 subjectType, uint256 subject) external view returns (uint256) {
        return IDelegatedStakeSubject(address(_stakeSubjects[subjectType])).allocatedStakePerManaged(subject);
    }

    /// Get if staking is activated for that `subjectType` and `subject`. If not set, will return false.
    function isStakeActivatedFor(uint8 subjectType, uint256 subject) external view returns (bool) {
        return _stakeSubjects[subjectType].getStakeThreshold(subject).activated;
    }

    /// Gets active stake (amount of staked tokens) on `subject` id for `subjectType`
    function activeStakeFor(uint8 subjectType, uint256 subject) external view returns (uint256) {
        return _fortaStaking.activeStakeFor(subjectType, subject);
    }

    /// Gets active and inactive stake (amount of staked tokens) on `subject` id for `subjectType`
    function totalStakeFor(uint8 subjectType, uint256 subject) external view override returns (uint256) {
        return _fortaStaking.activeStakeFor(subjectType, subject) + _fortaStaking.inactiveStakeFor(subjectType, subject);
    }

    function allocatedStakeFor(uint8 subjectType, uint256 subject) external view override returns (uint256) {
        return _fortaStaking.allocatedStakeFor(subjectType, subject);
    }

    /// Checks if subject, subjectType is registered
    function isRegistered(uint8 subjectType, uint256 subject) external view returns (bool) {
        return _stakeSubjects[subjectType].isRegistered(subject);
    }

    function canManageAllocation(uint8 subjectType, uint256 subject, address allocator) external view returns (bool) {
        return _stakeSubjects[subjectType].ownerOf(subject) == allocator;
    }
}
