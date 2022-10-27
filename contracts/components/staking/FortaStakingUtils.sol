// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

library FortaStakingUtils {
    /**
     * @dev Encode "active" and subjectType in subject by hashing them together, shifting left 9 bits,
     * setting bit 9 (to mark as active) and masking subjectType in
     * @param subjectType agents, scanner or future types of stake subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @return ERC1155 token id representing active shares.
     */
    function subjectToActive(uint8 subjectType, uint256 subject) internal pure returns (uint256) {
        return (uint256(keccak256(abi.encodePacked(subjectType, subject))) << 9 | uint16(256)) | uint256(subjectType);
    }

    /**
     * @dev Encode "inactive" and subjectType in subject by hashing them together, shifting left 9 bits,
     * letting bit 9 unset (to mark as inactive) and masking subjectType in.
     * @param subjectType agents, scanner or future types of stake subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @return ERC1155 token id representing inactive shares.
     */
    function subjectToInactive(uint8 subjectType, uint256 subject) internal pure returns (uint256) {
        return (uint256(keccak256(abi.encodePacked(subjectType, subject))) << 9) | uint256(subjectType);
    }

    /**
     * @dev Unsets bit 9 of an activeSharesId to mark as inactive
     * @param activeSharesId ERC1155 token id representing active shares.
     * @return ERC1155 token id representing inactive shares.
     */
    function activeToInactive(uint256 activeSharesId) internal pure returns (uint256) {
        return activeSharesId & (~uint256(1 << 8));
    }

    /**
     * @dev Sets bit 9 of an inactiveSharesId to mark as inactive
     * @param inactiveSharesId ERC1155 token id representing inactive shares.
     * @return ERC1155 token id representing active shares.
     */
    function inactiveToActive(uint256 inactiveSharesId) internal pure returns (uint256) {
        return inactiveSharesId | (1 << 8);
    }

    /**
     * @dev Checks if shares id is active
     * @param sharesId ERC1155 token id representing shares.
     * @return true if active shares, false if inactive
     */
    function isActive(uint256 sharesId) internal pure returns(bool) {
        return sharesId & (1 << 8) == 256;
    }

    /**
     * @dev Extracts subject type encoded in shares id
     * @param sharesId ERC1155 token id representing shares.
     * @return subject type (see SubjectTypeValidator.sol)
     */
    function subjectTypeOfShares(uint256 sharesId) internal pure returns(uint8) {
        return uint8(sharesId);
    }
}
