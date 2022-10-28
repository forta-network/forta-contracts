// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "./IStakeSubject.sol";

interface IDelegatedStakeSubject is IStakeSubject {
    function getTotalManagedSubjects(uint256 managerId) external view returns(uint256);
    function getManagedStakeThreshold(uint256 managedId) external view returns(StakeThreshold memory);
}