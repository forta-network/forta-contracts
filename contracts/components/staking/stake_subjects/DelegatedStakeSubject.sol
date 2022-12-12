// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../../../errors/GeneralErrors.sol";
import "./IDelegatedStakeSubject.sol";
import "./IStakeSubjectGateway.sol";
import "../SubjectTypeValidator.sol";
import "../../Roles.sol";
import "../../utils/AccessManaged.sol";

abstract contract DelegatedStakeSubjectUpgradeable is AccessManagedUpgradeable, IDelegatedStakeSubject {
    IStakeSubjectGateway private _subjectGateway;

    event SubjectHandlerUpdated(address indexed newHandler);
    error StakedUnderMinimum(uint256 subject);

    /*
     * @dev: For contracts made StakeAwareUpgradeable via upgrade, initializer call is not available.
     * Use setSubjectHandler(subjectGateway) when upgrading instead.
     * @param subjectGateway address.
     */
    function __StakeSubjectUpgradeable_init(address subjectGateway) internal initializer {
        _setSubjectHandler(subjectGateway);
    }

    /// Stake controller setter, restricted to DEFAULT_ADMIN_ROLE
    function setSubjectHandler(address subjectGateway) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _setSubjectHandler(subjectGateway);
    }

    /// Getter for subjectGateway
    function getSubjectHandler() public view returns (IStakeSubjectGateway) {
        return _subjectGateway;
    }

    /// Internal setter for subjectGateway, emits subjectGatewayUpdated
    function _setSubjectHandler(address subjectGateway) private {
        if (subjectGateway == address(0)) revert ZeroAddress("subjectGateway");
        _subjectGateway = IStakeSubjectGateway(subjectGateway);
        emit SubjectHandlerUpdated(subjectGateway);
    }

    /**
     *   5 (Not 50, since it was part of an upgrade of XXXRegistryCore)
     * - 1 _subjectGateway;
     * --------------------------
     *   4 __gap
     */
    uint256[4] private __gap;
}
