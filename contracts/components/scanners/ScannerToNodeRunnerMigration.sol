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
    uint256 public constant MAX_SCANNERS = 100;

    ScannerRegistry public scannerNodeRegistry;
    NodeRunnerRegistry public nodeRunnerRegistry;
    uint256 public migrationEndTime;

    event SetScannerNodeRegistry(address registry);
    event SetNodeRunnerRegistry(address registry);
    event SetMigrationEndtime(uint256 migrationEndTime);
    event MigrationExecuted(uint256 scannersMigrated, uint256 ignoredScanners, uint256 nodeRunnerId, bool mintedNodeRunner);

    error NotOwnerOfNodeRunner(address pretender, uint256 nodeRunnerId);

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

    /**
     * @notice Method to self migrate from the old ScannerRegistry NFTs to a single NodeRunnerRegistry NFT.
     * WARNING: ScannerNodeRegistry's manager addresses will not be migrated, please user NodeRunnerRegistry's methods to set them again.
     * @param scanners array of scanner addresses to be migrated. Have to be less than MAX_SCANNERS.
     * All the enabled (disabled flags set to 0) ScannerRegistry ERC721 identified by the uint256(address) in the input array will be:
     * - Registered in NodeRunnerRegistry to the nodeRunnerId either indicated or generated, with the same chainId and metadata.
     * - Deleted in ScannerNodeRegistry. The ERC721 will be burned, disabled flags and managers deleted from storage.
     * Scanners with disabled flags != 0 will be ignored (opted out), and will stay disabled in ScannerNodeRegistry.
     * @param nodeRunnerId If the set as 0, the NodeRunnerRegistry ERC721 will be minted to the sender (address must not own any),
     * set as a valid NodeRunnerRegistry ERC721 id owned by sender address otherwise.
     * @return NodeRunnerRegistry ERC721 id the scanners are migrated to.
     */
    function selfMigrate(address[] calldata scanners, uint256 nodeRunnerId) external returns (uint256) {
        return _migrate(scanners, nodeRunnerId, _msgSender());
    }

    /**
     * @notice Method to migrate from the old ScannerRegistry NFTs to a single NodeRunnerRegistry NFT, executed by an address with the role
     * MIGRATION_EXECUTOR_ROLE.
     * WARNING: ScannerNodeRegistry's manager addresses will not be migrated, please user NodeRunnerRegistry's methods to set them again.
     * @param scanners array of scanner addresses to be migrated. Have to be less than MAX_SCANNERS.
     * All the enabled (disabled flags set to 0) ScannerRegistry ERC721 identified by the uint256(address) in the input array will be:
     * - Registered in NodeRunnerRegistry to the nodeRunnerId either indicated or generated, with the same chainId and metadata.
     * - Deleted in ScannerNodeRegistry. The ERC721 will be burned, disabled flags and managers deleted from storage.
     * Scanners with disabled flags != 0 will be ignored (opted out), and will stay disabled in ScannerNodeRegistry.
     * @param nodeRunnerId If the set as 0, the NodeRunnerRegistry ERC721 will be minted to nodeRunner (address must not own any),
     * set as a valid NodeRunnerRegistry ERC721 id owned by nodeRunner address otherwise.
     * @param nodeRunner address that owns the scanners and will own the NodeRunnerRegistry ERC721
     * @return NodeRunnerRegistry ERC721 id the scanners are migrated to.
     */
    function migrate(
        address[] calldata scanners,
        uint256 nodeRunnerId,
        address nodeRunner
    ) external onlyRole(MIGRATION_EXECUTOR_ROLE) returns (uint256) {
        return _migrate(scanners, nodeRunnerId, nodeRunner);
    }

    function _migrate(
        address[] calldata scanners,
        uint256 inputNodeRunnerId,
        address nodeRunner
    ) private returns (uint256) {
        uint256 nodeRunnerId = inputNodeRunnerId;
        if (nodeRunnerRegistry.balanceOf(nodeRunner) == 0 && nodeRunnerId == NODE_RUNNER_NOT_MIGRATED) {
            nodeRunnerId = nodeRunnerRegistry.migrateToNodeRunner(nodeRunner);
        } else if (nodeRunnerRegistry.ownerOf(nodeRunnerId) != nodeRunner) {
            revert NotOwnerOfNodeRunner(nodeRunner, nodeRunnerId);
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
        return nodeRunnerId;
    }

    /*********** IScannerMigration ***********/

    function isScannerInNewRegistry(uint256 scannerId) external view override returns (bool) {
        return nodeRunnerRegistry.isScannerRegistered(address(uint160(scannerId)));
    }

    function getScannerState(uint256 scannerId)
        external
        view
        override
        returns (
            bool registered,
            address owner,
            uint256 chainId,
            string memory metadata,
            bool enabled,
            uint256 disabledFlags
        )
    {
        bool disabled;
        (registered, owner, chainId, metadata, enabled, disabled) =  nodeRunnerRegistry.getScannerState(address(uint160(scannerId)));
        if (disabled) {
            disabledFlags = 1;
        }
        return (registered, owner, chainId, metadata, enabled, disabledFlags);
    }

    function getScanner(uint256 scannerId)
        external
        view
        override
        returns (
            bool registered,
            address owner,
            uint256 chainId,
            string memory metadata
        )
    {
        (registered, owner, chainId, metadata, , ) =  nodeRunnerRegistry.getScannerState(address(uint160(scannerId)));
        return (registered, owner, chainId, metadata);
    }

    function isScannerOperational(uint256 scannerId) external view override returns (bool) {
        return nodeRunnerRegistry.isScannerOperational(address(uint160(scannerId)));
    }

    /*********** Admin methods ***********/

    /// Sets ScannerNodeRegistry address
    function setScannerNodeRegistry(address _scannerNodeRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setScannerNodeRegistry(_scannerNodeRegistry);
    }

    function _setScannerNodeRegistry(address _scannerNodeRegistry) private {
        if (_scannerNodeRegistry == address(0)) revert ZeroAddress("_scannerNodeRegistry");
        scannerNodeRegistry = ScannerRegistry(_scannerNodeRegistry);
        emit SetScannerNodeRegistry(_scannerNodeRegistry);
    }

    /// Sets NodeRunnerRegistry address
    function setNodeRunnerRegistry(address _nodeRunnerRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setNodeRunnerRegistry(_nodeRunnerRegistry);
    }

    function _setNodeRunnerRegistry(address _nodeRunnerRegistry) private {
        if (_nodeRunnerRegistry == address(0)) revert ZeroAddress("_nodeRunnerRegistry");
        nodeRunnerRegistry = NodeRunnerRegistry(_nodeRunnerRegistry);
        emit SetNodeRunnerRegistry(_nodeRunnerRegistry);
    }

    /// Sets timestamp marking the end of the migration process
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
