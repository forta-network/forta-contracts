// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../BaseComponent.sol";

import "./ScannerRegistryCore.sol";
import "./ScannerRegistryManaged.sol";
import "./ScannerRegistryEnable.sol";
import "./ScannerRegistryMetadata.sol";

contract ScannerRegistry is
    BaseComponent,
    ScannerRegistryCore,
    ScannerRegistryManaged,
    ScannerRegistryEnable,
    ScannerRegistryMetadata
{
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

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

    function _scannerUpdate(uint256 agentId, uint256 chainId) internal virtual override(ScannerRegistryCore, ScannerRegistryMetadata) {
        super._scannerUpdate(agentId, chainId);
    }

    uint256[50] private __gap;
}