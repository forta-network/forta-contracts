// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../token/Forta.sol";

contract FortaExtendedMock is Forta {
    function version() external pure override returns (string memory) {
        return type(FortaExtendedMock).name;
    }
}
