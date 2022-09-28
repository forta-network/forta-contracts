// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../BaseComponentUpgradeable.sol";
import "./NodeRunnerRegistryManaged.sol";

contract NodeRunnerRegistry is BaseComponentUpgradeable, NodeRunnerRegistryManaged {
    string public constant version = "0.1.0";

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     * @param __name ERC721 token name.
     * @param __symbol ERC721 token symbol.
     */
    function initialize(
        address __manager,
        string calldata __name,
        string calldata __symbol
    ) public initializer {
        __BaseComponentUpgradeable_init(__manager);
        __ERC721_init(__name, __symbol);
        __ERC721Enumerable_init();
    }

    /**
     * @notice Gets all NodeRunner properties and state
     * @param scannerId ERC721 token id of the NodeRunner.
     * @return registered true if NodeRunner exists.
     * @return owner address.
     * @return chainId the NodeRunner is monitoring.
     * @return metadata IPFS pointer for the NodeRunner's JSON metadata.
     * @return enabled true if staked over minimum and not disabled.
     * @return disabledFlags 0 if not disabled, Permission if disabled.
     */
    /*function getScannerState(uint256 scannerId)
        external
        view
        returns (
            bool registered,
            address owner,
            uint256 chainId,
            string memory metadata,
            bool enabled,
            uint256 disabledFlags
        )
    {
        (registered, owner, chainId, metadata) = super.getScanner(scannerId);
        return (registered, owner, chainId, metadata, isEnabled(scannerId), getDisableFlags(scannerId));
    }*/

    /**
     * @notice Helper to get either msg msg.sender if not a meta transaction, signer of forwarder metatx if it is.
     * @inheritdoc ForwardedContext
     */
    function _msgSender() internal view virtual override(BaseComponentUpgradeable, NodeRunnerRegistryCore) returns (address sender) {
        return super._msgSender();
    }

    /**
     * @notice Helper to get msg.data if not a meta transaction, forwarder data in metatx if it is.
     * @inheritdoc ForwardedContext
     */
    function _msgData() internal view virtual override(BaseComponentUpgradeable, NodeRunnerRegistryCore) returns (bytes calldata) {
        return super._msgData();
    }

    uint256[50] private __gap;
}
