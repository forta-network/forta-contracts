// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

interface IRewardsDistributor {
    function didAllocate(uint8 subjectType, uint256 subject, uint256 stakeAmount, uint256 sharesAmount, address staker) external;
    function didUnallocate(uint8 subjectType, uint256 subject, uint256 stakeAmount, uint256 sharesAmount, address staker) external;
    function didTransferShares(uint256 sharesId, uint8 subjectType, address from, address to, uint256 sharesAmount) external;
}


