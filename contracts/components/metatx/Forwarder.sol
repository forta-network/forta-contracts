// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "./EIP712WithNonce.sol";

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

    bytes32 private constant _FORWARDREQUEST_TYPEHASH =
        keccak256("ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint256 deadline,bytes data)");

    error DeadlineExpired();
    error SignatureDoesNotMatch();

    constructor() EIP712("Forwarder", "1") {}

    /**
     * @notice Executes a ForwardRequest (meta-tx) if signature is verified, deadline is met and nonce is valid
     * @dev This implementations allows for out of order execution, by allowing several "timelines" per nonce
     * by splitting the uint256 type space into 128 bit subspaces where each subspace is interpreted as maintaining
     * an ordered timeline. The intent of the design is to allow multiple nonces to be valid at any given time.
     * For a detailed explanation: https://github.com/amxx/permit#out-of-order-execution
     * For an example on how to leverage this functionality, see tests/forwarder/forwarder.test.js
     * Will emit NonceUsed(user, timeline, nonce) for better reporting / UX 
     * WARNING: failed transactions do not consume a nonce, unlinke regular ethereum transactions. Please make use
     * of the deadline functionality, and if you want to cancel a request, submit a successful transaction with the same
     * nonce. 
     * @param req  ForwardRequest to be executed
     * @param signature EIP-712 signature of the ForwardRequest
     * @return (success, returnData) of the executed request 
     */
    function execute(ForwardRequest calldata req, bytes calldata signature)
        external
        payable
        returns (bool, bytes memory)
    {
        _verifyAndConsumeNonce(req.from, req.nonce); // revert if failure

        if (!(req.deadline == 0 || req.deadline > block.timestamp)) revert DeadlineExpired();
        if (
            !SignatureChecker.isValidSignatureNow(
                req.from,
                _hashTypedDataV4(keccak256(abi.encode(_FORWARDREQUEST_TYPEHASH, req.from, req.to, req.value, req.gas, req.nonce, req.deadline, keccak256(req.data)))),
                signature
            )
        ) revert SignatureDoesNotMatch();

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