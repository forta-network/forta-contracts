// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.4;

contract Sink {
    event GotSignal(bytes data);

    fallback() external payable {
        emit GotSignal(msg.data);
    }
}