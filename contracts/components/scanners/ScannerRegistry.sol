// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

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

    function register(address owner, uint256 chainId, string calldata metadata) public virtual override(ScannerRegistryCore, ScannerRegistryEnable) {
        super.register(owner, chainId, metadata);
    }

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

    function _isStakedOverMin(uint256 scannerId) internal virtual override view returns(bool) {
        (uint256 chainId, ) = getScanner(scannerId);
        return getStakeController().totalStakeFor(SCANNER_SUBJECT, scannerId) >= getStakeThreshold(chainId).min;
    }
    

    function _msgSender() internal view virtual override(BaseComponentUpgradeable, ScannerRegistryCore, ScannerRegistryEnable) returns (address sender) {
        return super._msgSender();
    }

    function _msgData() internal view virtual override(BaseComponentUpgradeable, ScannerRegistryCore, ScannerRegistryEnable) returns (bytes calldata) {
        return super._msgData();
    }

    uint256[50] private __gap;
}