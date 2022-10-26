// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../BaseComponentUpgradeable.sol";
import "./ScannerRegistry.sol";
import "../node_runners/NodeRunnerRegistry.sol";

/**
 * Migration of ScannerRegistry to NodeRunnerRegistry
 */
contract ScannerToNodeRunnerMigration is BaseComponentUpgradeable {
    /** Contract version */
    string public constant version = "0.1.0";
    uint256 public constant NODE_RUNNER_NOT_MIGRATED = 0;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    ScannerRegistry public immutable scannerNodeRegistry;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    NodeRunnerRegistry public immutable nodeRunnerRegistry;

    event MigrationExecuted(uint256 scannersMigrated, uint256 scannersIgnored, uint256 indexed nodeRunnerId, bool mintedNodeRunner);

    error NotOwnerOfNodeRunner(address pretender, uint256 nodeRunnerId);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(
        address _forwarder,
        address _scannerNodeRegistry,
        address _nodeRunnerRegistry
    ) initializer ForwardedContext(_forwarder) {
        if (_scannerNodeRegistry == address(0)) revert ZeroAddress("_scannerNodeRegistry");
        if (_nodeRunnerRegistry == address(0)) revert ZeroAddress("_nodeRunnerRegistry");
        scannerNodeRegistry = ScannerRegistry(_scannerNodeRegistry);
        nodeRunnerRegistry = NodeRunnerRegistry(_nodeRunnerRegistry);
    }

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     */
    function initialize(address __manager) public initializer {
        __BaseComponentUpgradeable_init(__manager);
    }

    /**
     * @notice Method to self migrate from the old ScannerRegistry NFTs to a single NodeRunnerRegistry NFT.
     * WARNING: ScannerNodeRegistry's manager addresses will not be migrated, please user NodeRunnerRegistry's methods to set them again.
     * @param scanners array of scanner addresses to be migrated.
     * All the scanners willing to migrate (optingOutOfMigration flags set to false) ScannerRegistry ERC721 identified by the uint256(address)
     * in the input array will be:
     * - Registered in NodeRunnerRegistry to the nodeRunnerId either indicated or generated, with the same chainId and metadata.
     * - Deleted in ScannerNodeRegistry. The ERC721 will be burned, disabled flags and managers deleted from storage.
     * Scanners with optingOutOfMigration flags == true will be ignored (opted out), and will stay in ScannerNodeRegistry.
     * At migration end, they will stop receiving work and rewards.
     * @param nodeRunnerId If set as 0, a new NodeRunnerRegistry ERC721 will be minted to nodeRunner (but it must not own any prior),
     * otherwise must be set as a valid NodeRunnerRegistry ERC721 id owned by nodeRunner.
     * @return NodeRunnerRegistry ERC721 id the scanners are migrated to.
     */
    function selfMigrate(address[] calldata scanners, uint256 nodeRunnerId) external returns (uint256) {
        return _migrate(scanners, nodeRunnerId, _msgSender());
    }

    /**
     * @notice Method to migrate from the old ScannerRegistry NFTs to a single NodeRunnerRegistry NFT, executed by an address with the role
     * MIGRATION_EXECUTOR_ROLE.
     * WARNING: ScannerNodeRegistry's manager addresses will not be migrated, please user NodeRunnerRegistry's methods to set them again.
     * @param scanners array of scanner addresses to be migrated.
     * All the scanners willing to migrate (optingOutOfMigration flags set to false) ScannerRegistry ERC721 identified by the uint256(address)
     * in the input array will be:
     * - Registered in NodeRunnerRegistry to the nodeRunnerId either indicated or generated, with the same chainId and metadata.
     * - Deleted in ScannerNodeRegistry. The ERC721 will be burned, disabled flags and managers deleted from storage.
     * Scanners with with optingOutOfMigration flags == true will be ignored (opted out), and will stay in ScannerNodeRegistry.
     * @param nodeRunnerId If set as 0, a new NodeRunnerRegistry ERC721 will be minted to nodeRunner (but it must not own any prior),
     * otherwise must be set as a valid NodeRunnerRegistry ERC721 id owned by nodeRunner.
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
            nodeRunnerId = nodeRunnerRegistry.registerMigratedNodeRunner(nodeRunner);
        } else if (nodeRunnerRegistry.ownerOf(nodeRunnerId) != nodeRunner) {
            revert NotOwnerOfNodeRunner(nodeRunner, nodeRunnerId);
        }
        uint256 total = scanners.length;
        uint256 scannersMigrated = 0;
        for (uint256 i = 0; i < total; i++) {
            address scanner = scanners[i];
            uint256 scannerId = scannerNodeRegistry.scannerAddressToId(scanner);
            if (scannerNodeRegistry.ownerOf(scannerId) != nodeRunner) revert SenderNotOwner(nodeRunner, scannerId);
            if (!scannerNodeRegistry.optingOutOfMigration(scannerId)) {
                (, , uint256 chainId, string memory metadata, , uint256 disabledFlags) = scannerNodeRegistry.getScannerState(scannerId);
                nodeRunnerRegistry.registerMigratedScannerNode(
                    NodeRunnerRegistryCore.ScannerNodeRegistration({
                        scanner: scanner,
                        nodeRunnerId: nodeRunnerId,
                        chainId: chainId,
                        metadata: metadata,
                        timestamp: block.timestamp
                    }),
                    disabledFlags != 0
                );
                scannerNodeRegistry.deregisterScannerNode(scannerId);
                scannersMigrated++;
            }
        }
        emit MigrationExecuted(scannersMigrated, total - scannersMigrated, nodeRunnerId, inputNodeRunnerId == NODE_RUNNER_NOT_MIGRATED);
        return nodeRunnerId;
    }

    uint256[48] private __gap;
}
