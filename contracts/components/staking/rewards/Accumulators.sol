// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

library Accumulators {
    struct EpochCheckpoint {
        uint32 epochNumber;
        uint224 rate;
        uint256 value;
    }

    struct Accumulator {
        EpochCheckpoint[] checkpoints;
    }

    function getValue(Accumulator storage acc) internal view returns (uint256) {
        EpochCheckpoint memory origin = latest(acc);
        return origin.value + origin.rate * (getEpochNumber() - origin.epochNumber);
    }

    function getValueAtEpoch(Accumulator storage acc, uint256 epoch) internal view returns (uint256) {
        EpochCheckpoint memory origin = getAtEpoch(acc, epoch);
        return origin.value + origin.rate * (epoch - origin.epochNumber);
    }

    function addRate(Accumulator storage acc, uint256 rate) internal {
        setRate(acc, latest(acc).rate + rate);
    }

    function subRate(Accumulator storage acc, uint256 rate) internal {
        setRate(acc, latest(acc).rate - rate);
    }

    function setRate(Accumulator storage acc, uint256 rate) internal {
        uint32 currentEpoch = getEpochNumber();
        EpochCheckpoint memory ckpt = EpochCheckpoint({
            epochNumber: currentEpoch,
            rate: SafeCast.toUint224(rate),
            value: getValue(acc)
        });
        uint256 length = acc.checkpoints.length;
        if (length > 0 && acc.checkpoints[length - 1].epochNumber == currentEpoch) {
            acc.checkpoints[length - 1] = ckpt;
        } else {
            acc.checkpoints.push(ckpt);
        }
    }

    function latest(Accumulator storage acc) internal view returns (EpochCheckpoint memory) {
        uint256 length = acc.checkpoints.length;
        if (length == 0) {
            return zeroEpoch();
        } else {
            return acc.checkpoints[length - 1];
        }
    }

    /**
     * @dev Returns the checkpoint at a given epoch number. If a checkpoint is not available at that
     * epoch, the closest one before it is returned, or a zero epoch checkpoint otherwise.
     */
    function getAtEpoch(Accumulator storage acc, uint256 epochNumber) internal view returns (EpochCheckpoint memory) {
        require(epochNumber < getEpochNumber(), "Checkpoints: epoch not yet finished");

        uint256 high = acc.checkpoints.length;
        uint256 low = 0;
        while (low < high) {
            uint256 mid = Math.average(low, high);
            if (acc.checkpoints[mid].epochNumber > epochNumber) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }
        return high == 0 ? zeroEpoch() : acc.checkpoints[high - 1];
    }

    function zeroEpoch() private view returns (EpochCheckpoint memory) {
        return EpochCheckpoint({
            epochNumber: getEpochNumber(),
            rate: 0,
            value: 0
        });
    }

    function getEpochNumber() internal view returns (uint32) {
        return SafeCast.toUint32(block.timestamp / 1 weeks);
    }
}
