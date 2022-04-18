// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.4;

interface IRootChainManager {
    function tokenToType(address) external view returns (bytes32);
    function typeToPredicate(bytes32) external view returns (address);
    function depositFor(address, address, bytes calldata) external;
    function exit(bytes calldata) external;
}