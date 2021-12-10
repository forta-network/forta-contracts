// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ScannerRegistryCore.sol";

abstract contract ScannerRegistryMetadata is ScannerRegistryCore {
    struct ScannerMetadata {
        uint256 chainId;
    }

    mapping(uint256 => ScannerMetadata) private _scannerMetadata;
    /**
     * Version of the scanner image software the network expects
     */
    string public scannerNodeVersion;

    event ScannerNodeVersionUpdated(string newVersion, string oldVersion);

    /**
     * Setting t
     */
    function setScannerNodeVersion(string calldata version) public onlyRole(SCANNER_ADMIN_ROLE) {
        require(
            keccak256(abi.encodePacked(scannerNodeVersion)) != keccak256(abi.encodePacked(version)),
            "must update to different scannerNodeVersion"
        );
        emit ScannerNodeVersionUpdated(version, scannerNodeVersion);
        scannerNodeVersion = version;
    }

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
