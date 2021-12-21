// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.2;

/**
 * @title Mask
 * 
 */
contract Mask {
    uint256 public masked;

    function mask(bool activated, uint8 subjectType, uint256 id ) external {
        masked = id << 9;// | uint8(activated);
    }
}
