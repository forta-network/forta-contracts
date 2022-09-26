// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../vesting/_old/vesting_wallet/VestingWalletV0.sol";

contract VestingWalletExtendedMock is VestingWallet {
    function version() external pure returns (string memory) {
        return type(VestingWalletExtendedMock).name;
    }
}
