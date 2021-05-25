// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../Fortify.sol";

contract Fortify2 is Fortify {
    function version() external view returns (string memory) {
        return type(Fortify2).name;
    }
}
