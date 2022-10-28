// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

interface IRewardsDistributor {
    function didAddStake(uint256 shareId, uint256 amount, address staker) external;
    function didRemoveStake(uint256 shareId, uint256 amount, address staker) external;
}