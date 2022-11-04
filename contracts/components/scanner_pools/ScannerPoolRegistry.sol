// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../BaseComponentUpgradeable.sol";
import "./ScannerPoolRegistryCore.sol";
import "./ScannerPoolRegistryManaged.sol";

/**
 * ERC721 Registry of Scanner Pools. Each scanner ScannerPool EOA controls a number of Scanner Nodes through the ownership of this NFT,
 * represented by their EOA address.
 * The Scanner Pool must register themselves, then register scanner addresses to be controlled by their scannerPoolId (incremental uint).
 * Registered Scanner Pools can also assign managers to manage the scanners.
 * Each Scanner Pool has a single "chainId" for all the scanners, and each scanner has metadata (string that can point to a URL, IPFS…).
 * Scanner Pool owners and managers can update said metadata.
 * Scanner Nodes can be enabled or disabled by:
 * - the Scanner itself,
 * - the ScannerPool owner
 * - any of the scanner managers
 * If the scannerId is staked under the minimum stake, it can’t be `enabled()` and `isEnabled()` will return false, regardless of the disabled flag.
 * If the scanner is not registered, `isEnabled()` will return false.
 * A Scanner Node that is not enabled will not receive work (bot assignments)
 */
contract ScannerPoolRegistry is BaseComponentUpgradeable, ScannerPoolRegistryCore, ScannerPoolRegistryManaged {
    string public constant version = "0.1.0";

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder, address stakeAllocator) initializer ForwardedContext(forwarder) ScannerPoolRegistryCore(stakeAllocator) {}

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     * @param __name ERC721 token name.
     * @param __symbol ERC721 token symbol.
     * @param __stakeSubjectGateway address of StakeSubjectGateway
     * @param __registrationDelay amount of time allowed from scanner signing a ScannerNodeRegistration request and it's execution
     */
    function initialize(
        address __manager,
        string calldata __name,
        string calldata __symbol,
        address __stakeSubjectGateway,
        uint256 __registrationDelay
    ) public initializer {
        __BaseComponentUpgradeable_init(__manager);
        __ScannerPoolRegistryCore_init(__name, __symbol, __stakeSubjectGateway, __registrationDelay);
    }

    function registerMigratedScannerPool(address scannerPoolAddress, uint256 chainId) external onlyRole(SCANNER_2_SCANNER_POOL_MIGRATOR_ROLE) returns (uint256 scannerPoolId) {
        return _registerScannerPool(scannerPoolAddress, chainId);
    }

    function registerMigratedScannerNode(ScannerNodeRegistration calldata req, bool disabled) external onlyRole(SCANNER_2_SCANNER_POOL_MIGRATOR_ROLE) {
        _registerScannerNode(req);
        if (disabled) {
            _setScannerDisableFlag(req.scanner, true);
        }
    }

    /**
     * @notice disambiguation of _canSetEnableState, adding SCANNER_2_SCANNER_POOL_MIGRATOR_ROLE to the allowed setters.
     * @inheritdoc ScannerPoolRegistryManaged
     */
    function _canSetEnableState(address scanner) internal view virtual override(ScannerPoolRegistryCore, ScannerPoolRegistryManaged) returns (bool) {
        return super._canSetEnableState(scanner) || hasRole(SCANNER_2_SCANNER_POOL_MIGRATOR_ROLE, _msgSender());
    }

    /**
     * @notice Helper to get either msg msg.sender if not a meta transaction, signer of forwarder metatx if it is.
     * @inheritdoc ForwardedContext
     */
    function _msgSender() internal view virtual override(BaseComponentUpgradeable, ScannerPoolRegistryCore) returns (address sender) {
        return super._msgSender();
    }

    /**
     * @notice Helper to get msg.data if not a meta transaction, forwarder data in metatx if it is.
     * @inheritdoc ForwardedContext
     */
    function _msgData() internal view virtual override(BaseComponentUpgradeable, ScannerPoolRegistryCore) returns (bytes calldata) {
        return super._msgData();
    }

    uint256[50] private __gap;
}
