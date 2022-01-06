// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library FortaStakingUtils {
    /**
     * Encode "active" and subjectType in subject by hashing them together, shifting left 9 bits,
     * setting bit 9 (to mark as active) and masking subjectType in
     */
    function subjectToActive(uint8 subjectType, uint256 subject) internal pure returns (uint256) {
        return (uint256(keccak256(abi.encodePacked(subjectType, subject))) << 9 | uint16(256)) | subjectType;
    }

    /**
     * Encode "inactive" and subjectType in subjectby hashing them together, shifting left 9 bits,
     * letting bit 9 unset (to mark as inactive) and masking subjectType in
     */
    function subjectToInactive(uint8 subjectType, uint256 subject) internal pure returns (uint256) {
        return (uint256(keccak256(abi.encodePacked(subjectType, subject))) << 9) | subjectType;
    }

    /**
     * Unsets bit 9 of an activeSharesId to mark as inactive
     */
    function activeToInactive(uint256 activeSharesId) internal pure returns (uint256) {
        return activeSharesId & (~uint256(1 << 8));
    }

    /**
     * Sets bit 9 of an inactiveSharesId to mark as inactive
     */
    function inactiveToActive(uint256 inactiveSharesId) internal pure returns (uint256) {
        return inactiveSharesId | (1 << 8);
    }


    function isActive(uint256 sharesId) internal pure returns(bool) {
        return sharesId & (1 << 8) == 256;
    }

    function subjectTypeOfShares(uint256 sharesId) internal pure returns(uint8) {
        return uint8(sharesId);
    }
}
