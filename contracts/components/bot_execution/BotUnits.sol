// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

contract BotUnits {
    
    struct OwnerBotUnits {
        uint256 activeBotUnits;
        uint256 botUnitCapacity; 
    }

    mapping(address => OwnerBotUnits) private _ownerBotUnits;

    error InsufficientInactiveBotUnits();

    // Setting rather than adding since membership
    // plans grant a fixed amount of bot units
    function updateOwnerBotUnitsCapacity(address owner, uint256 amount, bool balanceIncrease) external /** only Unlock hook contract */ {
        if (balanceIncrease) {
            _ownerBotUnits[owner].botUnitCapacity = amount;
        } else {
            uint256 currentActiveBotUnits = _ownerBotUnits[owner].activeBotUnits;
            if (amount < currentActiveBotUnits) {
                revert InsufficientInactiveBotUnits();
            }
            _ownerBotUnits[owner].botUnitCapacity = amount;
        }
    }

    function updateOwnerActiveBotUnits(address owner, uint256 amount, bool balanceIncrease) external /** only AgentRegistry contract*/ {
        if (balanceIncrease) {
            if ((_ownerBotUnits[owner].activeBotUnits + amount) > _ownerBotUnits[owner].botUnitCapacity) {
                revert InsufficientInactiveBotUnits();
            }
            _ownerBotUnits[owner].activeBotUnits += amount;
        } else {
            _ownerBotUnits[owner].activeBotUnits -= amount;
        }
    }

    function ownerBotUnitsCapacity(address owner) public view returns (uint256) {
        return _ownerBotUnits[owner].botUnitCapacity;
    }

    function ownerActiveBotUnits(address owner) public view returns (uint256) {
        return _ownerBotUnits[owner].activeBotUnits;
    }

    function ownerInactiveBotUnits(address owner) public view returns (uint256) {
        return _ownerBotUnits[owner].botUnitCapacity - _ownerBotUnits[owner].activeBotUnits;
    }

    /**
     *  50
     * - # _ownerBotUnits
     * --------------------------
     *  ## __gap
     */
    uint256[50] private __gap;
}