// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../vesting/VestingWallet.sol";

contract VestingWalletExtendedMock is VestingWallet {
    function version() external pure returns (string memory) {
        return type(VestingWalletExtendedMock).name;
    }
}
