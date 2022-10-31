// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

interface IRewardReceiver {
    function onRewardReceived(
        uint8 subjectType,
        uint256 subject,
        uint256 amount
    ) external;
}
