// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../vesting/_old/VestingWalletV0.sol";

contract VestingWalletExtendedMock is VestingWallet {
    function version() external pure returns (string memory) {
        return type(VestingWalletExtendedMock).name;
    }
}
