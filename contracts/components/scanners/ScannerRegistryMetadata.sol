// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ScannerRegistryCore.sol";

abstract contract ScannerRegistryMetadata is ScannerRegistryCore {
    struct ScannerMetadata {
        uint256 chainId;
        string metadata;
    }

    mapping(uint256 => ScannerMetadata) private _scannerMetadata;

    /**
     * @notice Gets scanner metadata, and chain Ids.
     * @param scannerId ERC1155 token id of the scanner.
     * @return chainId the scanner scans.
     * @return metadata IPFS pointer for the scanner's JSON metadata.
     */
    function getScanner(uint256 scannerId) public view returns (uint256 chainId, string memory metadata) {
        return (
            _scannerMetadata[scannerId].chainId,
            _scannerMetadata[scannerId].metadata
        );
    }

    /**
     * @notice internal logic for scanner update.
     * @dev adds metadata and chainId for that scanner
     * @param scannerId ERC1155 token id of the scanner.
     * @param chainId the scanner scans.
     * @param metadata IPFS pointer for the scanner's JSON metadata.
     */
    function _scannerUpdate(uint256 scannerId, uint256 chainId, string calldata metadata) internal virtual override {
        super._scannerUpdate(scannerId, chainId, metadata);

        _scannerMetadata[scannerId] = ScannerMetadata({ chainId: chainId, metadata: metadata });
    }

    uint256[49] private __gap;
}
