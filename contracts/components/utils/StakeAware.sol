// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../staking/IStakeController.sol";
import "../staking/FortaStakingSubjectTypes.sol";
import "../Roles.sol";
import "./AccessManaged.sol";

abstract contract StakeAwareUpgradeable is AccessManagedUpgradeable {
    IStakeController private _stakeController;

    event StakeControllerUpdated(address indexed newstakeController);

    function __StakeAwareUpgradeable_init(address stakeController) internal initializer {
        _setStakeController(stakeController);
    }

    function _setStakeController(address stakeController) private {
        require(stakeController != address(0), "StakeAwareUpgradeable: stakeController cannot be address(0)");
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
