// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../errors/GeneralErrors.sol";
import "../staking/IStakeController.sol";
import "../staking/FortaStakingSubjectTypes.sol";
import "../Roles.sol";
import "./AccessManaged.sol";

abstract contract StakeAwareUpgradeable is AccessManagedUpgradeable {
    IStakeController private _stakeController;

    event StakeControllerUpdated(address indexed newstakeController);

    /*
    * @dev: For contracts made StakeAwareUpgradeable via upgrade, initializer call is not available.
    * Use setStakeController(stakeController) when upgrading instead.
    */
    function __StakeAwareUpgradeable_init(address stakeController) internal initializer {
        _setStakeController(stakeController);
    }

    function _setStakeController(address stakeController) private {
        if (stakeController == address(0)) revert ZeroAddress("stakeController");
        _stakeController = IStakeController(stakeController);
        emit StakeControllerUpdated(stakeController);
    }

    function setStakeController(address stakeController) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _setStakeController(stakeController);
    }

    function getStakeController() public view returns(address) {
        return address(_stakeController);
    }

    function _isStakedOverMin(uint8 subjectType, uint256 subject) internal view returns(bool) {
        return _stakeController.isStakedOverMin(subjectType, subject);
    }

    function _getMinStake(uint8 subjectType) internal view returns (uint256) {
        return _stakeController.getMinStake(subjectType);
    }

    uint256[4] private __gap;
}
