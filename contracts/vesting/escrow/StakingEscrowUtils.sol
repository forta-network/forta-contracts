// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

library StakingEscrowUtils {

    function computeSalt(address vesting, address manager) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(vesting, manager));
    }
}
