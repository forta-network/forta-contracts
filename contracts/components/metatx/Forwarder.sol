// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";

abstract contract EIP712WithNonce is EIP712 {
    event NonceUsed(address indexed user, uint256 indexed timeline, uint256 nonce);

    mapping(address => mapping(uint256 => uint256)) private _nonces;

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function getNonce(address from) public view virtual returns (uint256) {
        return uint256(_nonces[from][0]);
    }

    function getNonce(address from, uint256 timeline) public view virtual returns (uint256) {
        return _nonces[from][timeline];
    }

    function _verifyAndConsumeNonce(address user, uint256 fullNonce) internal virtual {
        uint256 timeline = fullNonce >> 128;
        uint256 nonce    = uint128(fullNonce);
        uint256 expected = _nonces[user][timeline]++;

        require(nonce == expected, "EIP712WithNonce: invalid-nonce");

        emit NonceUsed(user, timeline, nonce);
    }
}

import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

contract Forwarder is EIP712WithNonce {
    struct ForwardRequest {
        address from;
        address to;
        uint256 value;
        uint256 gas;
        uint256 nonce;
        uint256 deadline;
        bytes   data;
    }

    bytes32 private constant _TYPEHASH =
        keccak256("ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint256 deadline,bytes data)");

    constructor() EIP712("Forwarder", "1") {}

    /**
     * Executes a ForwardRequest (meta-tx) if signature is verified, deadline is met and nonce is valid
     * NOTE: This implementations allows for out of order execution, by allowing several "timelines" per nonce
     * by splitting the uint256 type space into 128 bit subspaces where each subspace is interpreted as maintaining
     * an ordered timeline. The intent of the design is to allow multiple nonces to be valid at any given time.
     * For a detailed explanation: https://github.com/amxx/permit#out-of-order-execution
     * For an example on how to leverage this functionality, see tests/forwarder/forwarder.test.js
     * Will emit NonceUsed(user, timeline, nonce) for better reporting / UX 
     * @param req  ForwardRequest to be executed
     * @param signature EIP-712 signature of the ForwardRequest
     * @return (success, returnData) of the executed request 
     */
    function execute(ForwardRequest calldata req, bytes calldata signature)
        public
        payable
        returns (bool, bytes memory)
    {
        _verifyAndConsumeNonce(req.from, req.nonce); // revert if failure

        require(
            req.deadline == 0 || req.deadline > block.timestamp,
            "Forwarder: deadline expired"
        );
        require(
            SignatureChecker.isValidSignatureNow(
                req.from,
                _hashTypedDataV4(keccak256(abi.encode(_TYPEHASH, req.from, req.to, req.value, req.gas, req.nonce, req.deadline, keccak256(req.data)))),
                signature
            ),
            "Forwarder: signature does not match request"
        );

        (bool success, bytes memory returndata) = req.to.call{gas: req.gas, value: req.value}(
            abi.encodePacked(req.data, req.from)
        );
        // Validate that the relayer has sent enough gas for the call.
        // See https://ronan.eth.link/blog/ethereum-gas-dangers/
        if (gasleft() <= req.gas / 63) {
          // We explicitly trigger invalid opcode to consume all gas and bubble-up the effects, since
          // Panic error do not consume all gas since Solidity 0.8.0
          // https://docs.soliditylang.org/en/v0.8.0/control-structures.html#panic-via-assert-and-error-via-require
          assembly {
            invalid()
          }
        }
        return (success, returndata);
    }
}