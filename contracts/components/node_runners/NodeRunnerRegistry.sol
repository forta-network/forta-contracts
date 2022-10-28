// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../BaseComponentUpgradeable.sol";
import "./NodeRunnerRegistryCore.sol";
import "./NodeRunnerRegistryManaged.sol";

/**
 * ERC721 Registry of Node Runners. Each node runner controls a number of Scanner Nodes, represented by their EOA address.
 * NodeRunner must register themselves, then register node addresses to be controlled by their NodeRunner ID (incremental uint). Registered NodeRunners can also assign managers to manage the nodes.
 * Each scanner has a single "chainId" and metadata (string that can point to a URL, IPFS…). Node runners and managers can update said metadata.
 * Scanner Nodes can be enabled or disabled by:
 * - the Scanner itself,
 * - the NodeRunner
 * - any of the scanner managers
 * If the scannerId is staked under the minimum stake, it can’t be `enabled()` and `isEnabled()` will return false, regardless of the disabled flag.
 * If the scanner is not registered, `isEnabled()` will return false.
 * A Scanner Node that is not enabled will not receive work (bot assignments)
 */
contract NodeRunnerRegistry is BaseComponentUpgradeable, NodeRunnerRegistryCore, NodeRunnerRegistryManaged {
    string public constant version = "0.1.0";

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder, address stakeAllocator) initializer ForwardedContext(forwarder) NodeRunnerRegistryCore(stakeAllocator) {}

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     * @param __name ERC721 token name.
     * @param __symbol ERC721 token symbol.
     * @param __stakeSubjectGateway address of StakeSubjectGateway
     * @param __registrationDelay amount of time allowed from scanner signing a ScannerNodeRegistration and it's execution by NodeRunner
     */
    function initialize(
        address __manager,
        string calldata __name,
        string calldata __symbol,
        address __stakeSubjectGateway,
        uint256 __registrationDelay
    ) public initializer {
        __BaseComponentUpgradeable_init(__manager);
        __NodeRunnerRegistryCore_init(__name, __symbol, __stakeSubjectGateway, __registrationDelay);
    }

    function registerMigratedNodeRunner(address nodeRunnerAddress, uint256 chainId) external onlyRole(SCANNER_2_NODE_RUNNER_MIGRATOR_ROLE) returns (uint256 nodeRunnerId) {
        return _registerNodeRunner(nodeRunnerAddress, chainId);
    }

    function registerMigratedScannerNode(ScannerNodeRegistration calldata req, bool disabled) external onlyRole(SCANNER_2_NODE_RUNNER_MIGRATOR_ROLE) {
        _registerScannerNode(req);
        if (disabled) {
            _setScannerDisableFlag(req.scanner, true);
        }
    }

    /**
     * @notice disambiguation of _canSetEnableState, adding SCANNER_2_NODE_RUNNER_MIGRATOR_ROLE to the allowed setters.
     * @inheritdoc NodeRunnerRegistryManaged
     */ 
    function _canSetEnableState(address scanner) internal virtual override(NodeRunnerRegistryCore, NodeRunnerRegistryManaged) view returns (bool) {
        return super._canSetEnableState(scanner) || hasRole(SCANNER_2_NODE_RUNNER_MIGRATOR_ROLE, _msgSender());
    }

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
