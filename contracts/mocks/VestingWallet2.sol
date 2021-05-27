// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../vesting/VestingWallet.sol";

contract VestingWallet2 is VestingWallet {
    function version() external pure returns (string memory) {
        return type(VestingWallet2).name;
    }
}
