pragma solidity ^0.8.0;
interface IStakeController {
  function setStakeParams(uint8 subjectType, uint256 min, uint256 max) external; 
  function getStakeParams(uint8 subjectType) external view returns (uint256 min, uint256 max);
  function isStakedOverMin(uint8 subjectType, uint256 subject) external view returns (bool);
}