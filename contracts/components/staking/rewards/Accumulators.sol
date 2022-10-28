// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "./EpochCheckpoints.sol";

library Accumulators {
    using EpochCheckpoints for EpochCheckpoints.History;

    struct Accumulator {
        EpochCheckpoints.History epochSnapshot;
        uint256 virtualRate;
        uint256 virtualSince;
    }

    function getValue(Accumulator storage acc) internal view returns (uint256) {
        return acc.epochSnapshot.latest() + acc.virtualRate * (block.timestamp - acc.virtualSince);
    }

    function getValueAtEpoch(Accumulator storage acc, uint256 epoch) internal view returns(uint256) {
        return acc.epochSnapshot.getAtEpoch(epoch);
    }

    function addRate(Accumulator storage acc, uint256 rate) internal {
        setRate(acc, acc.virtualRate + rate);
    }

    function subRate(Accumulator storage acc, uint256 rate) internal {
        setRate(acc, acc.virtualRate - rate);
    }

    function setRate(Accumulator storage acc, uint256 rate) internal {
        acc.epochSnapshot.push(getValue(acc));
        acc.virtualRate = rate;
        acc.virtualSince = block.timestamp;
    }
}