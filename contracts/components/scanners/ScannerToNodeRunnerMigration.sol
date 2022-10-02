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

    ScannerRegistry public scannerNodeRegistry;
    NodeRunnerRegistry public nodeRunnerRegistry;

    event SetScannerNodeRegistry(address registry);
    event SetNodeRunnerRegistry(address registry);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     */
    function initialize(address __manager, address __scannerNodeRegistry, address __nodeRunnerRegistry) public initializer {
        __BaseComponentUpgradeable_init(__manager);

        _setScannerNodeRegistry(__scannerNodeRegistry);
        _setNodeRunnerRegistry(__nodeRunnerRegistry);
    }

    function migrate(address scanner) external returns(uint256) {
        uint256 scannerId = scannerNodeRegistry.scannerAddressToId(scanner);
        if (scannerNodeRegistry.ownerOf(scannerId) != _msgSender()) revert SenderNotOwner(_msgSender(), scannerId);
        scannerNodeRegistry.deregisterScannerNode(scannerId);

        if (!nodeRunnerRegistry)


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

    uint256[48] private __gap;
}
