// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.4;

import "../BaseComponentUpgradeable.sol";
import "./ScannerRegistryCore.sol";
import "./ScannerRegistryManaged.sol";
import "./ScannerRegistryEnable.sol";
import "./ScannerRegistryMetadata.sol";

contract ScannerRegistry is
    BaseComponentUpgradeable,
    ScannerRegistryCore,
    ScannerRegistryManaged,
    ScannerRegistryEnable,
    ScannerRegistryMetadata
{
    string public constant version = "0.1.1";
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     * @param __router address of Router.
     * @param __name ERC1155 token name.
     * @param __symbol ERC1155 token symbol.
     */
    function initialize(
        address __manager,
        address __router,
        string calldata __name,
        string calldata __symbol
    ) public initializer {
        __AccessManaged_init(__manager);
        __Routed_init(__router);
        __UUPSUpgradeable_init();
        __ERC721_init(__name, __symbol);
    }

    /**
     * @notice Gets all scanner properties and state
     * @param scannerId ERC1155 token id of the scanner.
     * @return registered true if scanner exists.
     * @return owner address.
     * @return chainId the scanner is monitoring.
     * @return metadata IPFS pointer for the scanner's JSON metadata.
     */
    function getScannerState(uint256 scannerId)
        external
        view
        returns (bool registered, address owner, uint256 chainId, string memory metadata, bool enabled) {
        (registered, owner, chainId, metadata) = super.getScanner(scannerId);
        return (
            registered,
            owner,
            chainId,
            metadata,
            isEnabled(scannerId)
        );
    }

    /**
     * @notice Inheritance disambiguation for _scannerUpdate internal logic.
     * @inheritdoc ScannerRegistryCore
     */
    function _scannerUpdate(
        uint256 scannerId,
        uint256 chainId,
        string calldata metadata
    ) internal virtual override(
        ScannerRegistryCore,
        ScannerRegistryMetadata
    ) {
        super._scannerUpdate(scannerId, chainId, metadata);
    }

    /**
     * @dev inheritance disambiguation for _getStakeThreshold
     * see ScannerRegistryMetadata
     */
    function _getStakeThreshold(uint256 subject) internal virtual override(ScannerRegistryCore, ScannerRegistryMetadata) view returns(StakeThreshold memory) {
        return super._getStakeThreshold(subject);
    }

    /**
     * @notice Helper to get either msg msg.sender if not a meta transaction, signer of forwarder metatx if it is.
     * @inheritdoc ForwardedContext
     */
    function _msgSender() internal view virtual override(BaseComponentUpgradeable, ScannerRegistryCore, ScannerRegistryEnable) returns (address sender) {
        return super._msgSender();
    }

    /**
     * @notice Helper to get msg.data if not a meta transaction, forwarder data in metatx if it is.
     * @inheritdoc ForwardedContext
     */
    function _msgData() internal view virtual override(BaseComponentUpgradeable, ScannerRegistryCore, ScannerRegistryEnable) returns (bytes calldata) {
        return super._msgData();
    }

    uint256[50] private __gap;
}