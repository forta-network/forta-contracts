// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.4;

import "../token/Forta.sol";

contract FortaExtendedMock is Forta {
    function version() external pure override returns (string memory) {
        return type(FortaExtendedMock).name;
    }
}
