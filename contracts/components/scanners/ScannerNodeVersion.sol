// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../BaseComponentUpgradeable.sol";

/**
 * Contract that will trigger software autoupdate of the Scanner Node software.
 * Forta Governance, through SCANNER_VERSION_ROLE, will propose and approve updates and
 * the nodes will listen to the resulting event, downloading the new version from IPFS.
 * A similar system is provided for pre release version.
 */
contract ScannerNodeVersion is BaseComponentUpgradeable {
    /**
     * Version of the scanner image software the network expects (IPFS hash)
     * Starts empty
     */
    string public scannerNodeVersion;
    /**
     * Version of the scanner image software for pre release version (IPFS hash)
     * Starts empty
     */
    string public scannerNodeBetaVersion;

    /** Contract version */
    string public constant version = "0.1.1";

    event ScannerNodeVersionUpdated(string newVersion, string oldVersion);
    event ScannerNodeBetaVersionUpdated(string newVersion, string oldVersion);

    error SameScannerNodeVersion();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     */
    function initialize(address __manager) public initializer {
        __BaseComponentUpgradeable_init(__manager);
    }

    /**
     * @notice Signal to the Scanner Nodes that they have to update their binaries downloading the new
     * version from IPFS, by emitting ScannerNodeVersionUpdated(newVersion, oldVersion).
     * @dev restricted to SCANNER_VERSION_ROLE.
     * @param _version IPFS pointer to the new image.
     */
    function setScannerNodeVersion(string calldata _version) public onlyRole(SCANNER_VERSION_ROLE) {
        if (keccak256(abi.encodePacked(scannerNodeVersion)) == keccak256(abi.encodePacked(_version))) revert SameScannerNodeVersion();
        emit ScannerNodeVersionUpdated(_version, scannerNodeVersion);
        scannerNodeVersion = _version;
    }

    /**
     * @notice Signal to the Scanner Nodes that there is a new beta release downloadable from from IPFS,
     * by emitting ScannerNodeVersionUpdated(newVersion, oldVersion).
     * @dev restricted to SCANNER_BETA_VERSION_ROLE.
     * @param _version IPFS pointer to the new image.
     */
    function setScannerNodeBetaVersion(string calldata _version) public onlyRole(SCANNER_BETA_VERSION_ROLE) {
        if (keccak256(abi.encodePacked(scannerNodeBetaVersion)) == keccak256(abi.encodePacked(_version))) revert SameScannerNodeVersion();
        emit ScannerNodeBetaVersionUpdated(_version, scannerNodeBetaVersion);
        scannerNodeBetaVersion = _version;
    }

    /**
     *  50
     * - 1 scannerNodeVersion
     * - 1 scannerNodeBetaVersion
     * --------------------------
     *  48 __gap
     */
    uint256[48] private __gap;
}
