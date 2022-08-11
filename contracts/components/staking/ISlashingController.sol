// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.4;

interface ISlashingController {
    function getSlashedStakeValue(uint256 proposalId) external returns(uint256 stakeValue);
    function getSubject(uint256 proposalId) external returns(uint8 subjectType, uint256 subject);
    function getProposer(uint256 proposalId) external returns(address);
    function slashPercentToProposer() external returns(uint256);
}
