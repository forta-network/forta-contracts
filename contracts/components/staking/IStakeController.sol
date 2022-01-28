pragma solidity ^0.8.0;

interface IStakeController {
    event StakeSubjectHandlerChanged(address newHandler, address oldHandler);
    function setStakeSubjectHandler(uint8 subjectType, IStakeSubject subjectHandler) external;
    function totalStakeFor(uint8 subjectType, uint256 subject) external view returns (uint256); 
    
}
interface IStakeSubject {
    struct StakeThreshold {
        uint256 min;
        uint256 max;
    }
    function getStakeThreshold(uint256 subject) external view returns (StakeThreshold memory);
    function isStakedOverMin(uint256 subject) external view returns (bool);
}