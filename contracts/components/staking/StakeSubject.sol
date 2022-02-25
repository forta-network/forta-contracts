// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../errors/GeneralErrors.sol";
import "../staking/IStakeController.sol";
import "../staking/SubjectTypes.sol";
import "../Roles.sol";
import "../utils/AccessManaged.sol";

abstract contract StakeSubjectUpgradeable is AccessManagedUpgradeable, IStakeSubject {
    IStakeController private _stakeController;

    event StakeControllerUpdated(address indexed newstakeController);

    error StakeThresholdMaxLessOrEqualMin();
    error StakedUnderMinimum(uint256 subject);

    /*
    * @dev: For contracts made StakeAwareUpgradeable via upgrade, initializer call is not available.
    * Use setStakeController(stakeController) when upgrading instead.
    */
    function __StakeAwareUpgradeable_init(address stakeController) internal initializer {
        _setStakeController(stakeController);
    }

    function setStakeController(address stakeController) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _setStakeController(stakeController);
    }

    function getStakeController() public view returns(IStakeController) {
        return _stakeController;
    }

    function _setStakeController(address stakeController) private {
        if (stakeController == address(0)) revert ZeroAddress("stakeController");
        _stakeController = IStakeController(stakeController);
        emit StakeControllerUpdated(stakeController);
    }

    function isStakedOverMin(uint256 subject) external virtual override view returns(bool) {
        return _isStakedOverMin(subject);
    }

    function _isStakedOverMin(uint256 subject) internal virtual view returns(bool);


    uint256[4] private __gap;
}
