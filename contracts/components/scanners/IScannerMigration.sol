pragma solidity ^0.8.9;

interface IScannerMigration {
    function migrationEndTime() external view returns (uint256);
    function isScannerInNewRegistry(uint256 scannerId) external view returns (bool);
    function getScannerState(uint256 scannerId)
        external
        view
        returns (
            bool registered,
            address owner,
            uint256 chainId,
            string memory metadata,
            bool enabled,
            uint256 disabledFlags
        );
    function getScanner(uint256 scannerId) external view returns (bool registered, address owner, uint256 chainId, string memory metadata);
    function isScannerOperational(uint256 scannerId) external view returns(bool);
}