// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "./IStakeSubject.sol";

interface IStakeSubjectHandler {
    event StakeSubjectChanged(address newHandler, address oldHandler);
    function setStakeSubject(uint8 subjectType, IStakeSubject subject) external;
    function getStakeSubject(uint8 subjectType) external view returns(IStakeSubject);
    function activeStakeFor(uint8 subjectType, uint256 subject) external view returns(uint256);
    function maxStakeFor(uint8 subjectType, uint256 subject) external view returns(uint256);
    function minStakeFor(uint8 subjectType, uint256 subject) external view returns(uint256);
    function totalStakeFor(uint8 subjectType, uint256 subject) external view returns(uint256);
    function maxSlashableStakePercent() external view returns(uint256);
    function isStakeActivatedFor(uint8 subjectType, uint256 subject) external view returns(bool);
    function maxManagedStakeFor(uint8 subjectType, uint256 subject) external view returns (uint256);
    function minManagedStakeFor(uint8 subjectType, uint256 subject) external view returns (uint256);
    function totalManagedSubjectsFor(uint8 subjectType, uint256 subject) external view returns (uint256);
    function managerIdFor(uint8 managerSubjectType, uint256 managedSubject) external view returns (uint256);
}
