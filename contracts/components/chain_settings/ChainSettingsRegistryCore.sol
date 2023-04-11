// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../BaseComponentUpgradeable.sol";

abstract contract ChainSettingsRegistryCore is BaseComponentUpgradeable {

    uint256 constant MAX_CHAIN_IDS_PER_UPDATE = 5;

    uint256 private _supportedChainIdsAmount;
    mapping(uint256 => bool) private _chainIdSupported;
    mapping(uint256 => string) private _chainIdMetadata;
    // chainId => metadata => uniqueness
    mapping(uint256 => mapping(bytes32 => bool)) private _chainIdMetadataUniqueness;

    error ChainIdsAmountExceeded(uint256 exceedingAmount);
    error ChainIdAlreadySupported(uint256 chainId);
    error ChainIdUnsupported(uint256 chainId);
    error MetadataNotUnique(bytes32 hash);

    event ChainSettingsUpdated(uint256 chainId, string metadata);
    event ChainIdSupported(uint256 chainId);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {}

    // Update supported chain ids, both the amount and the ids themselves
    function updateSupportedChains(uint256[] calldata chainIds, string calldata metadata) external onlyRole(CHAIN_SETTINGS_ROLE) {
        // Cap on how many chain ids can be updated at once
        if(chainIds.length > MAX_CHAIN_IDS_PER_UPDATE) revert ChainIdsAmountExceeded(chainIds.length - MAX_CHAIN_IDS_PER_UPDATE);

        for(uint256 i = 0; i < chainIds.length; i++) {
            if(_chainIdSupported[chainIds[i]]) revert ChainIdAlreadySupported(chainIds[i]);
            _updateSupportedChainIds(chainIds[i]);
            _chainSettingsUpdate(chainIds[i], metadata);
        }

        _supportedChainIdsAmount += chainIds.length;
    }

    // Update chain settings to be fetched later
    function updateChainSettings(uint256[] calldata chainIds, string calldata metadata) external onlyRole(CHAIN_SETTINGS_ROLE) {
        if(chainIds.length > _supportedChainIdsAmount) revert ChainIdsAmountExceeded(chainIds.length - _supportedChainIdsAmount);

        for(uint256 i = 0; i < chainIds.length; i++) {
            if(!_chainIdSupported[chainIds[i]]) revert ChainIdUnsupported(chainIds[i]);
            _chainSettingsUpdate(chainIds[i], metadata);
        }
    }

    function _chainSettingsUpdate(uint256 chainId, string calldata metadata) private {
        bytes32 newHash = keccak256(bytes(metadata));
        if (_chainIdMetadataUniqueness[chainId][newHash]) revert MetadataNotUnique(newHash);
        bytes32 oldHash = keccak256(bytes(_chainIdMetadata[chainId]));
        _chainIdMetadataUniqueness[chainId][newHash] = true;
        _chainIdMetadataUniqueness[chainId][oldHash] = false;

        _chainIdMetadata[chainId] = metadata;
        emit ChainSettingsUpdated(chainId, metadata);
    }

    function _updateSupportedChainIds(uint256 chainId) private {
        _chainIdSupported[chainId] = true;
        emit ChainIdSupported(chainId);
    }

    function getChainIdSettings(uint256 chainId) public view returns (string memory) {
        return _chainIdMetadata[chainId];
    }

    function getSupportedChainIdsAmount() public view returns (uint256) {
        return _supportedChainIdsAmount;
    }

    function isChainIdSupported(uint256 chainId) public view returns (bool) {
        return _chainIdSupported[chainId];
    }

    /**
     * @notice Helper to get either msg msg.sender if not a meta transaction, signer of forwarder metatx if it is.
     * @inheritdoc ForwardedContext
     */
    function _msgSender() internal view virtual override(BaseComponentUpgradeable) returns (address sender) {
        return super._msgSender();
    }

    /**
     * @notice Helper to get msg.data if not a meta transaction, forwarder data in metatx if it is.
     * @inheritdoc ForwardedContext
     */
    function _msgData() internal view virtual override(BaseComponentUpgradeable) returns (bytes calldata) {
        return super._msgData();
    }

    /**
     *  50
     * - 1 _supportedChainIdsAmount;
     * - 1 _chainIdSupported;
     * - 1 _chainIdMetadata;
     * - 1 _chainIdMetadataUniqueness;
     * --------------------------
     *  46 __gap
     */
    uint256[46] private __gap;
}