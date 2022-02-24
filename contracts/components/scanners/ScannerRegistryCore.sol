// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";

import "../BaseComponentUpgradeable.sol";

abstract contract ScannerRegistryCore is
    BaseComponentUpgradeable,
    ERC721Upgradeable
{
    event ScannerUpdated(uint256 indexed scannerId, uint256 indexed chainId, string metadata);

    modifier onlyOwnerOf(uint256 scannerId) {
        require(_msgSender() == ownerOf(scannerId), "ScannerRegistryCore: Restricted to scanner owner");
        _;
    }

    function adminRegister(address scanner, address owner, uint256 chainId, string calldata metadata) public onlyRole(SCANNER_ADMIN_ROLE) {
        _register(scanner, owner, chainId, metadata);
    }

    function isRegistered(uint256 scannerId) public view returns(bool) {
        return _exists(scannerId);
    }

    function register(address owner, uint256 chainId, string calldata metadata) virtual public {
        _register(_msgSender(), owner, chainId, metadata);
    }

    function _register(address scanner, address owner, uint256 chainId, string calldata metadata) internal {
        uint256 scannerId = scannerAddressToId(scanner);
        _mint(owner, scannerId);

        _beforeScannerUpdate(scannerId, chainId, metadata);
        _scannerUpdate(scannerId, chainId, metadata);
        _afterScannerUpdate(scannerId, chainId, metadata);
    }

    function adminUpdate(address scanner, uint256 chainId, string calldata metadata) public onlyRole(SCANNER_ADMIN_ROLE) {
        uint256 scannerId = scannerAddressToId(scanner);
        require(isRegistered(scannerId), "ScannerRegistryCore: scanner must be registered");
        _beforeScannerUpdate(scannerId, chainId, metadata);
        _scannerUpdate(scannerId, chainId, metadata);
        _afterScannerUpdate(scannerId, chainId, metadata);
    }

    function scannerAddressToId(address scanner) public pure returns(uint256) {
        return uint256(uint160(scanner));
    }

    /**
     * Hook: Scanner metadata change (create)
     */
    function _beforeScannerUpdate(uint256 scannerId, uint256 chainId, string calldata metadata) internal virtual {
    }

    function _scannerUpdate(uint256 scannerId, uint256 chainId, string calldata metadata) internal virtual {
        emit ScannerUpdated(scannerId, chainId, metadata);
    }

    function _afterScannerUpdate(uint256 scannerId, uint256 chainId, string calldata metadata) internal virtual {
        _emitHook(abi.encodeWithSignature("hook_afterScannerUpdate(uint256,uint256,string)", scannerId, chainId, metadata));
    }


    function _msgSender() internal view virtual override(ContextUpgradeable, BaseComponentUpgradeable) returns (address sender) {
        return super._msgSender();
    }

    function _msgData() internal view virtual override(ContextUpgradeable, BaseComponentUpgradeable) returns (bytes calldata) {
        return super._msgData();
    }

    uint256[50] private __gap;
}