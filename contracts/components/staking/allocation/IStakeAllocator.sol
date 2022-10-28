// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

interface IStakeAllocator {
    function depositAllocation(
        uint256 activeSharesId,
        uint8 subjectType,
        uint256 subject,
        address allocator,
        uint256 amount
    ) external;

    function withdrawAllocation(
        uint256 activeSharesId,
        uint8 subjectType,
        uint256 subject,
        uint256 amount
    ) external;

    function allocatedStakePerManaged(uint8 subjectType, uint256 subject) external view returns (uint256);
}
