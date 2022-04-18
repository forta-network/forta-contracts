// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.4;

import "../BaseComponentUpgradeable.sol";

/**
 * Contract that will trigger software autoupdate of the Scanner Node software.
 * Forta Governance, through SCANNER_VERSION_ROLE, will propose and approve updates and
 * the nodes will listen to the resulting event, downloading the new version from IPFS
 */
contract ScannerNodeVersion is BaseComponentUpgradeable {

    /**
     * Version of the scanner image software the network expects (IPFS hash)
     * Starts empty
     */
    string public scannerNodeVersion;

    string public constant version = "0.1.0";

    event ScannerNodeVersionUpdated(string newVersion, string oldVersion);

    error SameScannerNodeVersion();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     * @param __router address of Router.
     */
    function initialize(
        address __manager,
        address __router
    ) public initializer {
        __AccessManaged_init(__manager);
        __Routed_init(__router);
        __UUPSUpgradeable_init();
    }

    /**
     * @notice Signal to the Scanner Nodes that they have to update their binaries downloading the new
     * version from IPFS, by emitting ScannerNodeVersionUpdated(newVersion, oldVersion).
     * @dev restricted to SCANNER_VERSION_ROLE (governance).
     * @param version IPFS pointer to the new image.
     */
    function setScannerNodeVersion(string calldata version) public onlyRole(SCANNER_VERSION_ROLE) {
        if(
            keccak256(abi.encodePacked(scannerNodeVersion)) == keccak256(abi.encodePacked(version))
        ) revert SameScannerNodeVersion();
        emit ScannerNodeVersionUpdated(version, scannerNodeVersion);
        scannerNodeVersion = version;
    }

    uint256[49] private __gap;
}
