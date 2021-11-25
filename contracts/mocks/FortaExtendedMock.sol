// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../token/Forta.sol";

contract FortaExtendedMock is Forta {
    function version() external pure returns (string memory) {
        return type(FortaExtendedMock).name;
    }
}
