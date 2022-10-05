// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../BaseComponentUpgradeable.sol";
import "./ScannerRegistry.sol";
import "./IScannerMigration.sol";
import "../node_runners/NodeRunnerRegistry.sol";

/**
 * Migration of ScannerRegistry to NodeRunnerRegistry
 */
contract ScannerToNodeRunnerMigration is BaseComponentUpgradeable, IScannerMigration {
    /** Contract version */
    string public constant version = "0.1.0";
    uint256 public constant NODE_RUNNER_NOT_MIGRATED = 0;

    ScannerRegistry public scannerNodeRegistry;
    NodeRunnerRegistry public nodeRunnerRegistry;
    uint256 public migrationEndTime;

    event SetScannerNodeRegistry(address registry);
    event SetNodeRunnerRegistry(address registry);
    event SetMigrationEndtime(uint256 migrationEndTime);
    event MigrationExecuted(uint256 scannersMigrated, uint256 ignoredScanners, uint256 nodeRunnerId, bool mintedNodeRunner);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     * @param __scannerNodeRegistry address of ScannerNodeRegistry (being deprecated)
     * @param __nodeRunnerRegistry address of NodeRunnerRegistry (new registry)
     * @param __migrationEndTime time when migration period ends 
     */
    function initialize(
        address __manager,
        address __scannerNodeRegistry,
        address __nodeRunnerRegistry,
        uint256 __migrationEndTime
    ) public initializer {
        __BaseComponentUpgradeable_init(__manager);

        _setScannerNodeRegistry(__scannerNodeRegistry);
        _setNodeRunnerRegistry(__nodeRunnerRegistry);
        _setMigrationEndTime(__migrationEndTime);
    }

    function selfMigrate(address[] calldata scanners, uint256 nodeRunnerId) external returns (uint256) {
        if (nodeRunnerId != NODE_RUNNER_NOT_MIGRATED && nodeRunnerRegistry.ownerOf(nodeRunnerId) != _msgSender()) {
            revert SenderNotOwner(_msgSender(), nodeRunnerId);
        }
        return _migrate(scanners, nodeRunnerId, _msgSender());
    }

    function migrate(address[] calldata scanners, uint256 nodeRunnerId, address nodeRunner) external onlyRole(MIGRATION_EXECUTOR_ROLE) returns (uint256) {
        return _migrate(scanners, nodeRunnerId, nodeRunner);
    }

    function _migrate(address[] calldata scanners, uint256 inputNodeRunnerId, address nodeRunner) private returns (uint256) {
        uint256 nodeRunnerId = inputNodeRunnerId;
        if (nodeRunnerRegistry.balanceOf(nodeRunner) == 0 && nodeRunnerId == NODE_RUNNER_NOT_MIGRATED) {
            nodeRunnerId = nodeRunnerRegistry.migrateToNodeRunner(nodeRunner);
        }
        uint256 total = scanners.length;
        uint256 scannersMigrated;
        for (uint256 i = 0; i < total; i++) {
            address scanner = scanners[i];
            uint256 scannerId = scannerNodeRegistry.scannerAddressToId(scanner);
            if (scannerNodeRegistry.ownerOf(scannerId) != nodeRunner) revert SenderNotOwner(nodeRunner, scannerId);
            (, , uint256 chainId, string memory metadata, , uint256 disabledFlags) = scannerNodeRegistry.getScannerState(scannerId);
            if (disabledFlags == 0) {
                nodeRunnerRegistry.migrateScannerNode(
                    NodeRunnerRegistryCore.ScannerNodeRegistration({
                        scanner: scanner,
                        nodeRunnerId: nodeRunnerId,
                        chainId: chainId,
                        metadata: metadata,
                        timestamp: block.timestamp
                    })
                );
                scannerNodeRegistry.deregisterScannerNode(scannerId);
                scannersMigrated++;
            }
        }
        emit MigrationExecuted(scannersMigrated, total - scannersMigrated, nodeRunnerId, inputNodeRunnerId == NODE_RUNNER_NOT_MIGRATED);
    }

    function setScannerNodeRegistry(address _scannerNodeRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setScannerNodeRegistry(_scannerNodeRegistry);
    }

    function _setScannerNodeRegistry(address _scannerNodeRegistry) private {
        if (_scannerNodeRegistry == address(0)) revert ZeroAddress("_scannerNodeRegistry");
        scannerNodeRegistry = ScannerRegistry(_scannerNodeRegistry);
        emit SetScannerNodeRegistry(_scannerNodeRegistry);
    }

    function setNodeRunnerRegistry(address _nodeRunnerRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setNodeRunnerRegistry(_nodeRunnerRegistry);
    }

    function _setNodeRunnerRegistry(address _nodeRunnerRegistry) private {
        if (_nodeRunnerRegistry == address(0)) revert ZeroAddress("_nodeRunnerRegistry");
        nodeRunnerRegistry = NodeRunnerRegistry(_nodeRunnerRegistry);
        emit SetScannerNodeRegistry(_nodeRunnerRegistry);
    }

    function setMigrationEndTime(uint256 _migrationEndTime) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setMigrationEndTime(_migrationEndTime);
    }

    function _setMigrationEndTime(uint256 _migrationEndTime) private {
        if (_migrationEndTime == 0) revert ZeroAmount("_migrationEndTime");
        migrationEndTime = _migrationEndTime;
        emit SetMigrationEndtime(migrationEndTime);
    }

    uint256[47] private __gap;
}
