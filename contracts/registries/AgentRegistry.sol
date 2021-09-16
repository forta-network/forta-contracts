// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "../tools/ENSReverseRegistration.sol";

import "./AgentRegistryCore.sol";
import "./AgentRegistryMetadata.sol";
import "./AgentRegistryEnumerable.sol";

contract AgentRegistry is
    AgentRegistryMetadata,
    AgentRegistryEnumerable,
    Multicall,
    UUPSUpgradeable
{
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        address __manager,
        string calldata __name,
        string calldata __symbol
    ) public initializer {
        __AccessManaged_init(__manager);
        __ERC721_init(__name, __symbol);
        __UUPSUpgradeable_init();
    }

    /**
     * @dev Administration: access control for the upgrade process
     */
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyRole(ADMIN_ROLE) {
    }

    /**
     * @dev Administration: allow the upgrader to set ENS reverse registration
     */
    function setName(address ensRegistry, string calldata ensName) public onlyRole(ADMIN_ROLE) {
        ENSReverseRegistration.setName(ensRegistry, ensName);
    }

    function _beforeAgentUpdate(uint256 agentId, string memory newMetadata, uint256[] calldata newChainIds) internal virtual override(AgentRegistryCore, AgentRegistryEnumerable) {
        super._beforeAgentUpdate(agentId, newMetadata, newChainIds);
    }
}
