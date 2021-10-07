// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";

abstract contract EIP712WithNonce is EIP712 {
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

    function _verifyAndConsumeNonce(address owner, uint256 idx) internal virtual {
        require(idx % (1 << 128) == _nonces[owner][idx >> 128]++, "invalid-nonce");
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
        assert(gasleft() > req.gas / 63);

        return (success, returndata);
    }
}