// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

contract Sink {
    event GotSignal(bytes data);

    fallback() external payable {
        emit GotSignal(msg.data);
    }
}