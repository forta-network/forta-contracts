// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md


pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";

abstract contract EIP712WithNonce is EIP712 {
    event NonceUsed(address indexed user, uint256 indexed timeline, uint256 nonce);

    error InvalidNonce(uint256 nonce);

    mapping(address => mapping(uint256 => uint256)) private _nonces;

    /**
     * @notice Domain Separator as defined in EIP712
     * @return keccak256(typeHash, nameHash, versionHash, block.chainid, address(this))
     */
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /**
     * @notice Gets nonce for the from address in the "default" timeline
     * @dev For a detailed explanation: https://github.com/amxx/permit#out-of-order-execution 
     * @param from address
     * @return nonce
     */
    function getNonce(address from) public view virtual returns (uint256) {
        return _nonces[from][0];
    }

    /**
     * @notice Gets nonce for the from address in the specified timeline
     * @dev For a detailed explanation: https://github.com/amxx/permit#out-of-order-execution 
     * @param from address
     * @param timeline where the nonce lives
     * @return nonce
     */
    function getNonce(address from, uint256 timeline) public view virtual returns (uint256) {
        return _nonces[from][timeline];
    }

     /**
     * @notice Extract timeline from nonce, iterates it to consume it, checks for replay protection.
     * @dev emits NonceUsed(user, timeline, nonce).
     * WARNING: Failed transactions would not consume a nonce, since the reverted transaction won't be able to save in storage.
     * @param user address sending the nonce.
     * @param fullNonce nonce and timeline info in uint256 space
     */
    function _verifyAndConsumeNonce(address user, uint256 fullNonce) internal virtual {
        uint256 timeline = fullNonce >> 128;
        uint256 nonce    = uint128(fullNonce);
        uint256 expected = _nonces[user][timeline]++;

        if (nonce != expected) revert InvalidNonce(nonce);

        emit NonceUsed(user, timeline, nonce);
    }
}
