// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";

import "../BaseComponent.sol";

contract ScannerRegistryCore is
    BaseComponent,
    ERC721Upgradeable
{
    modifier onlyOwnerOf(uint256 scannerId) {
        require(_msgSender() == ownerOf(scannerId), "Restricted to scanner owner");
        _;
    }

    function adminRegister(uint256 scannerId, address owner) public onlyRole(AGENT_ADMIN_ROLE) {
        _mint(owner, scannerId);
        _emitHook(abi.encodeWithSignature("hook_afterScannerRegistered(uint256)", scannerId));
    }

    function register(address owner) public {
        uint256 scannerId = uint256(uint160(_msgSender()));
        _mint(owner, scannerId);
        _emitHook(abi.encodeWithSignature("hook_afterScannerRegistered(uint256)", scannerId));
    }

    uint256[50] private __gap;
}