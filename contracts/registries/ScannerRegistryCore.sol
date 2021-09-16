// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";

import "../permissions/AccessManaged.sol";

contract ScannerRegistryCore is
    AccessManagedUpgradeable,
    ERC721Upgradeable
{
    bytes32 public constant SCANNER_MANAGER_ROLE = keccak256("SCANNER_MANAGER_ROLE");

    // TODO
}