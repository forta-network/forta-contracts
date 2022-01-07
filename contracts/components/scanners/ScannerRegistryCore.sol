// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";

import "../BaseComponentUpgradeable.sol";

abstract contract ScannerRegistryCore is
    BaseComponentUpgradeable,
    ERC721Upgradeable
{
    event ScannerUpdated(uint256 indexed scannerId, uint256 indexed chainId);

    modifier onlyOwnerOf(uint256 scannerId) {
        require(_msgSender() == ownerOf(scannerId), "ScannerRegistryCore: Restricted to scanner owner");
        _;
    }

    function adminRegister(address scanner, address owner, uint256 chainId) public onlyRole(SCANNER_ADMIN_ROLE) {
        _register(scanner, owner, chainId);
    }

    function isRegistered(uint256 scannerId) public view returns(bool) {
        return _exists(scannerId);
    }

    function register(address owner, uint256 chainId) virtual public {
        _register(_msgSender(), owner, chainId);
    }

    function _register(address scanner, address owner, uint256 chainId) public {
        uint256 scannerId = uint256(uint160(scanner));
        _mint(owner, scannerId);

        _beforeScannerUpdate(scannerId, chainId);
        _scannerUpdate(scannerId, chainId);
        _afterScannerUpdate(scannerId, chainId);
    }

    /**
     * Hook: Scanner metadata change (create)
     */
    function _beforeScannerUpdate(uint256 scannerId, uint256 chainId) internal virtual {
    }

    function _scannerUpdate(uint256 scannerId, uint256 chainId) internal virtual {
        emit ScannerUpdated(scannerId, chainId);
    }

    function _afterScannerUpdate(uint256 scannerId, uint256 chainId) internal virtual {
        _emitHook(abi.encodeWithSignature("hook_afterScannerUpdate(uint256)", scannerId));
    }

    function _msgSender() internal view virtual override(ContextUpgradeable, BaseComponentUpgradeable) returns (address sender) {
        return super._msgSender();
    }

    function _msgData() internal view virtual override(ContextUpgradeable, BaseComponentUpgradeable) returns (bytes calldata) {
        return super._msgData();
    }

    uint256[50] private __gap;
}