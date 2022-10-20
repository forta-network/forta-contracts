// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

interface IStakeSubject {
    struct StakeThreshold {
        uint256 min;
        uint256 max;
        bool activated;
    }
    function getStakeThreshold(uint256 subject) external view returns (StakeThreshold memory);
    function isStakedOverMin(uint256 subject) external view returns (bool);
    function isRegistered(uint256 subject) external view returns(bool);
}

interface IDelegatedStakeSubject is IStakeSubject {
    function getTotalManagedSubjects(uint256 subject) external view returns(uint256);
    function getManagedStakeThreshold(uint256 managedId) external view returns(StakeThreshold memory);
}