// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IStakeController.sol";
import "../BaseComponentUpgradeable.sol";
import "./SubjectTypes.sol";
import "./FortaStaking.sol";

contract FortaStakingParameters is BaseComponentUpgradeable, SubjectTypeValidator, IStakeController {

    FortaStaking private _fortaStaking;
    // stake subject parameters for each subject
    mapping(uint8 => IStakeSubject) private _stakeSubjectHandlers;

    event FortaStakingChanged(address staking);

    string public constant version = "0.1.0";

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

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



    function setFortaStaking(address newFortaStaking) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setFortaStaking(newFortaStaking);
    }

    function _setFortaStaking(address newFortaStaking) internal {
        require(newFortaStaking!= address(0), "FSP: address 0");
        _fortaStaking = FortaStaking(newFortaStaking);
        emit FortaStakingChanged(address(_fortaStaking));
    }

    /**
    * Sets stake subject handler stake for subject type.
    */
    function setStakeSubjectHandler(uint8 subjectType, IStakeSubject subjectHandler) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _onlyValidSubjectType(subjectType);
        require(address(subjectHandler) != address(0), "FSP: address 0");
        emit StakeSubjectHandlerChanged(address(subjectHandler), address(_stakeSubjectHandlers[subjectType]));
        _stakeSubjectHandlers[subjectType] = subjectHandler;
    }


    function maxStakeFor(uint8 subjectType, uint256 subject) external view returns(uint256) {
        return _stakeSubjectHandlers[subjectType].getStakeThreshold(subject).max;
    }

    function minStakeFor(uint8 subjectType, uint256 subject) external view returns(uint256) {
        return _stakeSubjectHandlers[subjectType].getStakeThreshold(subject).min;
    }

    function activeStakeFor(uint8 subjectType, uint256 subject) external view returns (uint256) {
        return _fortaStaking.activeStakeFor(subjectType, subject);
    }

     
}