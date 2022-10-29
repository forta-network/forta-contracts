// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SignedMath.sol";

uint256 constant EPOCH_LENGTH = 1 weeks;
uint256 constant MAX_BPS = 10000;

library Accumulators {
    struct EpochCheckpoint {
        uint32 timestamp;
        uint224 rate;
        uint240 value;
        int16 bpsFactor; // basis points
    }

    struct Accumulator {
        EpochCheckpoint[] checkpoints;
    }

    function getValue(Accumulator storage acc) internal view returns (uint256) {
        EpochCheckpoint memory origin = latest(acc);
        uint256 duration = block.timestamp - origin.timestamp;
        return origin.value + origin.rate * duration * uint256(int256(MAX_BPS) + origin.bpsFactor) / MAX_BPS;
    }

    function getValueAtEpoch(Accumulator storage acc, uint256 epoch) internal view returns (uint256) {
        EpochCheckpoint memory origin = getAtEpoch(acc, epoch);
        uint256 duration = getEpochEndTimestamp(epoch) - origin.timestamp;
        return origin.value + origin.rate * duration * uint256(int256(MAX_BPS) + origin.bpsFactor) / MAX_BPS;
    }

    function addRate(Accumulator storage acc, uint256 rate) internal {
        EpochCheckpoint memory ckpt = latest(acc);
        update(acc, ckpt.rate + rate, ckpt.bpsFactor);
    }

    function subRate(Accumulator storage acc, uint256 rate) internal {
        EpochCheckpoint memory ckpt = latest(acc);
        update(acc, ckpt.rate - rate, ckpt.bpsFactor);
    }

    function setFactor(Accumulator storage acc, int16 bpsFactor) internal {
        require(SignedMath.abs(bpsFactor) <= MAX_BPS);
        EpochCheckpoint memory ckpt = latest(acc);
        update(acc, ckpt.rate, bpsFactor);
    }

    function update(Accumulator storage acc, uint256 rate, int16 bpsFactor) private {
        EpochCheckpoint memory ckpt = EpochCheckpoint({
            timestamp: SafeCast.toUint32(block.timestamp),
            rate: SafeCast.toUint224(rate),
            value: SafeCast.toUint240(getValue(acc)),
            bpsFactor: bpsFactor
        });
        uint256 length = acc.checkpoints.length;
        if (length > 0 && isCurrentEpoch(acc.checkpoints[length - 1].timestamp)) {
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
     * @dev Returns the most recent checkpoint during a given epoch. If a checkpoint is not available at that
     * epoch, the closest one before it is returned, or a zero epoch checkpoint otherwise.
     */
    function getAtEpoch(Accumulator storage acc, uint256 epochNumber) internal view returns (EpochCheckpoint memory) {
        require(epochNumber < getEpochNumber(), "Checkpoints: epoch not yet finished");

        uint256 epochEnd = getEpochEndTimestamp(epochNumber);

        uint256 high = acc.checkpoints.length;
        uint256 low = 0;
        while (low < high) {
            uint256 mid = Math.average(low, high);
            if (acc.checkpoints[mid].timestamp > epochEnd) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }
        return high == 0 ? zeroEpoch() : acc.checkpoints[high - 1];
    }

    function zeroEpoch() private pure returns (EpochCheckpoint memory) {
        return EpochCheckpoint({
            timestamp: 0,
            rate: 0,
            value: 0,
            bpsFactor: 0
        });
    }

    function getEpochNumber() internal view returns (uint32) {
        return SafeCast.toUint32(block.timestamp / EPOCH_LENGTH);
    }

    function getEpochEndTimestamp(uint256 epochNumber) internal pure returns (uint256) {
        return (epochNumber + 1) * EPOCH_LENGTH;
    }

    function isCurrentEpoch(uint256 timestamp) internal view returns (bool) {
        uint256 currentEpochStart = (block.timestamp / EPOCH_LENGTH) * EPOCH_LENGTH;
        return timestamp > currentEpochStart;
    }
}
