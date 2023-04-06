// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../BaseComponentUpgradeable.sol";

abstract contract ChainSettingsRegistryCore is BaseComponentUpgradeable {

    mapping(uint256 => string) private _chainIdToChainSettingsMetadata;
    mapping(bytes32 => bool) private _chainSettingstMetadataUniqueness;

    error MetadataNotUnique(bytes32 hash);

    event ChainSettingsUpdated(uint256 chainId, string metadata);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {}

    function updateChainSettings(uint256 chainId, string memory metadata) public onlyRole(CHAIN_SETTINGS_ROLE) {
        _chainSettingsUpdate(chainId, metadata);
    }

    function _chainSettingsUpdate(uint256 chainId, string memory metadata) internal {

        bytes32 oldHash = keccak256(bytes(_chainIdToChainSettingsMetadata[chainId]));
        bytes32 newHash = keccak256(bytes(metadata));
        if (_chainSettingstMetadataUniqueness[newHash]) revert MetadataNotUnique(newHash);
        _chainSettingstMetadataUniqueness[newHash] = true;
        _chainSettingstMetadataUniqueness[oldHash] = false;

        _chainIdToChainSettingsMetadata[chainId] = metadata;
        emit ChainSettingsUpdated(chainId, metadata);
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

    uint256[50] private __gap;
}