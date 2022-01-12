pragma solidity ^0.8.0;
interface IStakeController {
  event MinStakeChanged(uint256 newMinStake, uint256 oldMinStake);
  
  function setMinStake(uint8 subjectType, uint256 amount) external; 
  function getMinStake(uint8 subjectType) external view returns (uint256);
  function isStakedOverMin(uint8 subjectType, uint256 subject) external view returns (bool);
}