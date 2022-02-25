// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";

abstract contract EIP712WithNonce is EIP712 {
    event NonceUsed(address indexed user, uint256 indexed timeline, uint256 nonce);

    mapping(address => mapping(uint256 => uint256)) private _nonces;

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function getNonce(address from) public view virtual returns (uint256) {
        return _nonces[from][0];
    }

    function getNonce(address from, uint256 timeline) public view virtual returns (uint256) {
        return _nonces[from][timeline];
    }

    /**
     * @dev Failed transactions would not consume a nonce, since the reverted transaction won't be able to save in storage.
     */
    function _verifyAndConsumeNonce(address user, uint256 fullNonce) internal virtual {
        uint256 timeline = fullNonce >> 128;
        uint256 nonce    = uint128(fullNonce);
        uint256 expected = _nonces[user][timeline]++;

        require(nonce == expected, "EIP712WithNonce: invalid-nonce");

        emit NonceUsed(user, timeline, nonce);
    }
}