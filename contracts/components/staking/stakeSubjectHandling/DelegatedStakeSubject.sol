// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../../../errors/GeneralErrors.sol";
import "./IDelegatedStakeSubject.sol";
import "./IStakeSubjectHandler.sol";
import "../SubjectTypeValidator.sol";
import "../../Roles.sol";
import "../../utils/AccessManaged.sol";

abstract contract DelegatedStakeSubjectUpgradeable is AccessManagedUpgradeable, IDelegatedStakeSubject {
    IStakeSubjectHandler private _subjectHandler;

    event SubjectHandlerUpdated(address indexed newHandler);
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
    function getSubjectHandler() public view returns (IStakeSubjectHandler) {
        return _subjectHandler;
    }

    /// Internal setter for subjectHandler, emits subjectHandlerUpdated
    function _setSubjectHandler(address subjectHandler) private {
        if (subjectHandler == address(0)) revert ZeroAddress("subjectHandler");
        _subjectHandler = IStakeSubjectHandler(subjectHandler);
        emit SubjectHandlerUpdated(subjectHandler);
    }

    uint256[4] private __gap;
}
