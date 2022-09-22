// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "./ScannerRegistryCore.sol";

abstract contract ScannerRegistryMetadata is ScannerRegistryCore {
    struct ScannerMetadata {
        uint256 chainId;
        string metadata;
    }

    mapping(uint256 => ScannerMetadata) private _scannerMetadata;

    /**
     * @notice Gets all scanner properties.
     * @param scannerId ERC721 token id of the scanner.
     * @return registered true if scanner exists.
     * @return owner address.
     * @return chainId the scanner is monitoring.
     * @return metadata IPFS pointer for the scanner's JSON metadata.
     */
    function getScanner(uint256 scannerId) public view returns (bool registered, address owner, uint256 chainId, string memory metadata) {
        bool exists = _exists(scannerId);
        return (
            exists,
            exists ? ownerOf(scannerId) : address(0),
            _scannerMetadata[scannerId].chainId,
            _scannerMetadata[scannerId].metadata
        );
    }

    /**
     * @notice Gets scanner chain Ids.
     * @param scannerId ERC721 token id of the scanner.
     * @return chainId the scanner is monitoring.
     */
    function getScannerChainId(uint256 scannerId) public view returns (uint256) {
        return _scannerMetadata[scannerId].chainId;
    }
    
    
    /**
     * @dev checks the StakeThreshold for the chainId the scanner with id `subject` was registered to monitor.
     * @param subject ERC721 token id of the scanner.
     * @return StakeThreshold registered for `chainId`, or StakeThreshold(0,0,false) if `chainId` not found.
     */
    function _getStakeThreshold(uint256 subject) override virtual internal view returns(StakeThreshold memory) {
        return _stakeThresholds[getScannerChainId(subject)];
    }

    /**
     * @notice internal logic for scanner update.
     * @dev adds metadata and chainId for that scanner
     * @param scannerId ERC721 token id of the scanner.
     * @param chainId the scanner scans.
     * @param metadata IPFS pointer for the scanner's JSON metadata.
     */
    function _scannerUpdate(uint256 scannerId, uint256 chainId, string calldata metadata) internal virtual override {
        super._scannerUpdate(scannerId, chainId, metadata);
        _scannerMetadata[scannerId] = ScannerMetadata({ chainId: chainId, metadata: metadata });
    }

    uint256[49] private __gap;
}
