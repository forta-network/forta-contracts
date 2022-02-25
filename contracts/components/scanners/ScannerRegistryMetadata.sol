// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./ScannerRegistryCore.sol";

abstract contract ScannerRegistryMetadata is ScannerRegistryCore {
    struct ScannerMetadata {
        uint256 chainId;
        string metadata;
    }

    mapping(uint256 => ScannerMetadata) private _scannerMetadata;

    function getScanner(uint256 scannerId) public view returns (uint256 chainId, string memory metadata) {
        return (
            _scannerMetadata[scannerId].chainId,
            _scannerMetadata[scannerId].metadata
        );
    }

    function _getStakeThreshold(uint256 subject) override virtual internal view returns(StakeThreshold memory) {
        (uint256 chainId, ) = getScanner(subject);
        return _stakeThresholds[chainId];
    }


    function _scannerUpdate(uint256 scannerId, uint256 chainId, string calldata metadata) internal virtual override {
        super._scannerUpdate(scannerId, chainId, metadata);
        _scannerMetadata[scannerId] = ScannerMetadata({ chainId: chainId, metadata: metadata });
    }

    uint256[49] private __gap;
}
