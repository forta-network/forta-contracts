// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library FortaStakingUtils {
    function subjectToActive(address subject) internal pure returns (uint256) {
        return uint256(uint160(subject));
    }

    function subjectToInactive(address subject) internal pure returns (uint256) {
        return uint256(uint160(subject)) | 2 ** 160;
    }

    function sharesToSubject(uint256 tokenId) internal pure returns (address) {
        return address(uint160(tokenId));
    }
}
