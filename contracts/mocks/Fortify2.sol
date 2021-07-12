// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../Forta.sol";

contract Forta2 is Forta {
    function version() external pure returns (string memory) {
        return type(Forta2).name;
    }
}
