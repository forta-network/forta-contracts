// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Sink {
    event GotSignal(bytes data);

    fallback() external payable {
        emit GotSignal(msg.data);
    }
}