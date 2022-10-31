// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

interface IStakeAllocator {
    function depositAllocation(
        uint256 activeSharesId,
        uint8 subjectType,
        uint256 subject,
        address allocator,
        uint256 stakeAmount,
        uint256 sharesAmount
    ) external;

    function withdrawAllocation(
        uint256 activeSharesId,
        uint8 subjectType,
        uint256 subject,
        address allocator,
        uint256 stakeAmount,
        uint256 sharesAmount
    ) external;

    function allocatedStakePerManaged(uint8 subjectType, uint256 subject) external view returns (uint256);
    function didTransferShares(uint256 sharesId, uint8 subjectType, address from, address to, uint256 sharesAmount) external;
}
