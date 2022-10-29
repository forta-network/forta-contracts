// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

interface ISlashingExecutor {
    function freeze(
        uint8 subjectType,
        uint256 subject,
        bool frozen
    ) external;

    function slash(
        uint8 subjectType,
        uint256 subject,
        uint256 stakeValue,
        address proposer,
        uint256 proposerPercent
    ) external returns (uint256);

    function treasury() external view returns (address);
    function MAX_SLASHABLE_PERCENT() external view returns(uint256);
}
