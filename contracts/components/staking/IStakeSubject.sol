// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.4;

interface IStakeSubject {
    struct StakeThreshold {
        uint256 min;
        uint256 max;
        bool activated;
    }
    function getStakeThreshold(uint256 subject) external view returns (StakeThreshold memory);
    function isStakedOverMin(uint256 subject) external view returns (bool);
    function isRegistered(uint256 subjectId) external view returns(bool);
}