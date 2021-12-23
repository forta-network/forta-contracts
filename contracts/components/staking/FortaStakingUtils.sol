// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library FortaStakingUtils {
    /**
     * Encode "active" and subject type in subjectId by shifting subjectId 9 bits,
     * setting bit 9 (active) and setting bytes of subjectType
     */
    function subjectToActive(uint8 subjectType, uint256 subject) internal pure returns (uint256) {
        return (subject << 9 | uint16(256)) | subjectType;
    }

    function subjectToInactive(uint8 subjectType, uint256 subject) internal pure returns (uint256) {
        return (subject << 9) | subjectType;
    }

    function isActive(uint256 sharesId) external pure returns(bool) {
        return sharesId & (1 << 8) == 256;
    }

    function subjectTypeOfShares(uint256 sharesId) external pure returns(uint8) {
        return uint8(sharesId);
    }
}
