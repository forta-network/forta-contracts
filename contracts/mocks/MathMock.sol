// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.4;

import "../tools/FullMath.sol";


contract MathMock {

    function mulDiv(uint256 numerator, uint256 denominator, uint256 target) external pure returns (uint256 partialAmount) {
        return FullMath.mulDiv(numerator, denominator, target);
    }
}