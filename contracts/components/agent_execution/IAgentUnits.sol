// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

interface IAgentUnits {
    struct OwnerAgentUnits { uint256 activeAgentUnits; uint256 agentUnitCapacity; }
    
    function updateOwnerAgentUnitsCapacity(address owner, uint256 newCapacity, bool capacityIncrease) external;
    function updateOwnerActiveAgentUnits(address owner, uint256 amount, bool balanceIncrease) external;
    function getOwnerAgentUnitsCapacity(address owner) external view returns (uint256);
    function getOwnerActiveAgentUnits(address owner) external view returns (uint256);
    function getOwnerInactiveAgentUnits(address owner) external view returns (uint256);
    function isOwnerInGoodStanding(address owner) external view returns (bool);
}