// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.4;

import "./FortaStaking.sol";

contract FortaStakingParameters is BaseComponentUpgradeable, SubjectTypeValidator, IStakeController {
    FortaStaking private _fortaStaking;
    // stake subject parameters for each subject
    mapping(uint8 => IStakeSubject) private _stakeSubjectHandlers;

    event FortaStakingChanged(address staking);

    string public constant version = "0.1.0";
    uint256 public constant maxSlashableStakePercent = 90;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     * @param __router address of Router.
     * @param __fortaStaking address of FortaStaking.
     */
    function initialize(
        address __manager,
        address __router,
        address __fortaStaking
    ) public initializer {
        __AccessManaged_init(__manager);
        __Routed_init(__router);
        __UUPSUpgradeable_init();
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
    function setStakeSubjectHandler(uint8 subjectType, IStakeSubject subjectHandler) external onlyRole(DEFAULT_ADMIN_ROLE) onlyValidSubjectType(subjectType) {
        if (address(subjectHandler) == address(0)) revert ZeroAddress("subjectHandler");
        emit StakeSubjectHandlerChanged(address(subjectHandler), address(_stakeSubjectHandlers[subjectType]));
        _stakeSubjectHandlers[subjectType] = subjectHandler;
    }

    /// Get max stake for that `subjectType` and `subject`. If not set, will return 0.
    function maxStakeFor(uint8 subjectType, uint256 subject) external view returns (uint256) {
        return _stakeSubjectHandlers[subjectType].getStakeThreshold(subject).max;
    }

    /// Get min stake for that `subjectType` and `subject`. If not set, will return 0.
    function minStakeFor(uint8 subjectType, uint256 subject) external view returns (uint256) {
        return _stakeSubjectHandlers[subjectType].getStakeThreshold(subject).min;
    }

    /// Get if staking is activated for that `subjectType` and `subject`. If not set, will return false.
    function isStakeActivatedFor(uint8 subjectType, uint256 subject) external view returns (bool) {
        return _stakeSubjectHandlers[subjectType].getStakeThreshold(subject).activated;
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
        return _stakeSubjectHandlers[subjectType].isRegistered(subject);
    }

}