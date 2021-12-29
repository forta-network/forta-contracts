pragma solidity ^0.8.0;
interface IMinimumStakeController {
  event MinimumStakeChanged(uint256 newMinimumStake, uint256 oldMinimumStake);
  
  function setMinStake(uint8 subjectType, uint256 amount) external; 
  function getMinStake(uint8 subjectType) external returns (uint256);
  function isSubjectStakedOverMinimum(uint8 subjectType, uint256 subject) external returns (bool);
}