// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

interface IBotUnits {
    struct OwnerBotUnits { uint256 activeBotUnits; uint256 botUnitCapacity; }
    
    function updateOwnerBotUnitsCapacity(address owner, uint256 newCapacity, bool capacityIncrease) external;
    function updateOwnerActiveBotUnits(address owner, uint256 amount, bool balanceIncrease) external;
    function getOwnerBotUnitsCapacity(address owner) external view returns (uint256);
    function getOwnerActiveBotUnits(address owner) external view returns (uint256);
    function getOwnerInactiveBotUnits(address owner) external view returns (uint256);
    function isOwnerInGoodStanding(address owner) external view returns (bool);
}