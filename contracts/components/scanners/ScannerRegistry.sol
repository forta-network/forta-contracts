// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Multicall.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "../BaseComponent.sol";

import "./ScannerRegistryCore.sol";

contract ScannerRegistry is BaseComponent, ScannerRegistryCore
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
}