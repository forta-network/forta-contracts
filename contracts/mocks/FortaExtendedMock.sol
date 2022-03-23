// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../token/Forta.sol";

contract FortaExtendedMock is Forta {
    function version() external pure override returns (string memory) {
        return type(FortaExtendedMock).name;
    }
}
