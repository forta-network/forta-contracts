// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../../errors/GeneralErrors.sol";
import "../staking/IStakeSubjectHandler.sol";
import "../staking/SubjectTypes.sol";
import "../Roles.sol";
import "../utils/AccessManaged.sol";

abstract contract StakeSubjectUpgradeable is AccessManagedUpgradeable, IStakeSubject {
    IStakeSubjectHandler private _subjectHandler;

    event SubjectHandlerUpdated(address indexed newHandler);

    error StakeThresholdMaxLessOrEqualMin();
    error StakedUnderMinimum(uint256 subject);

    /*
    * @dev: For contracts made StakeAwareUpgradeable via upgrade, initializer call is not available.
    * Use setSubjectHandler(subjectHandler) when upgrading instead.
    * @param subjectHandler address.
    */
    function __StakeSubjectUpgradeable_init(address subjectHandler) internal initializer {
        _setSubjectHandler(subjectHandler);
    }

    /// Stake controller setter, restricted to DEFAULT_ADMIN_ROLE
    function setSubjectHandler(address subjectHandler) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _setSubjectHandler(subjectHandler);
    }

    /// Getter for subjectHandler
    function getSubjectHandler() public view returns(IStakeSubjectHandler) {
        return _subjectHandler;
    }

    /// Internal setter for subjectHandler, emits subjectHandlerUpdated
    function _setSubjectHandler(address subjectHandler) private {
        if (subjectHandler == address(0)) revert ZeroAddress("subjectHandler");
        _subjectHandler = IStakeSubjectHandler(subjectHandler);
        emit SubjectHandlerUpdated(subjectHandler);
    }

    /// Returns true if `subject` amount of staked tokens is bigger or equal the minimum stake set
    /// for it. It's for contracts implementing `StakeSubjectUpgradeable` to decide what that means.
    function isStakedOverMin(uint256 subject) external virtual override view returns(bool) {
        return _isStakedOverMin(subject);
    }

    function _isStakedOverMin(uint256 subject) internal virtual view returns(bool);

    uint256[4] private __gap;
}
