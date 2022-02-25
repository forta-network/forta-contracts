// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./IStakeSubject.sol";

interface IStakeController {
    event StakeSubjectHandlerChanged(address newHandler, address oldHandler);
    function setStakeSubjectHandler(uint8 subjectType, IStakeSubject subjectHandler) external;
    function activeStakeFor(uint8 subjectType, uint256 subject) external view returns(uint256);
    function maxStakeFor(uint8 subjectType, uint256 subject) external view returns(uint256);
    function minStakeFor(uint8 subjectType, uint256 subject) external view returns(uint256);
    function isStakeActivatedFor(uint8 subjectType, uint256 subject) external view returns(bool);
}
