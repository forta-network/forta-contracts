// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ScannerRegistryCore.sol";

abstract contract ScannerRegistryMetadata is ScannerRegistryCore {
    struct ScannerMetadata {
        uint256 chainId;
    }

    mapping(uint256 => ScannerMetadata) private _scannerMetadata;

    function getScanner(uint256 scannerId) public view returns (uint256 chainIds) {
        return (
            _scannerMetadata[scannerId].chainId
        );
    }

    function _scannerUpdate(uint256 scannerId, uint256 chainId) internal virtual override {
        super._scannerUpdate(scannerId, chainId);

        _scannerMetadata[scannerId] = ScannerMetadata({ chainId: chainId });
    }

    uint256[49] private __gap;
}
