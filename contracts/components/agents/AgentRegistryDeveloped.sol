// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/BitMaps.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "./AgentRegistryCore.sol";
abstract contract AgentRegistryDeveloped is AgentRegistryCore {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    mapping(uint256 => EnumerableSetUpgradeable.AddressSet) agentDevs;
    
    event AgentDevAdded(uint256 indexed agentId, address indexed by, address indexed dev);
    event AgentDevRemoved(uint256 indexed agentId, address indexed by, address indexed dev);
    /**
     * Agent Developer management
     */
    function addAgentDev(uint256 agentId, address dev)
    public
        onlyOwnerOf(agentId)
        frontrunProtected(keccak256(abi.encodePacked(agentId, dev)), 0 minutes) // TODO: 0 disables the check
    {
        require(dev != address(0), "Address(0) is not allowed");
        require(
            agentDevs[agentId].add(dev),
            "Address is already an agent admin"
        );
        emit AgentDevAdded(agentId, _msgSender(),  dev);
    }

    function removeAgentDev(uint256 agentId, address dev)
    public
        onlyOwnerOf(agentId)
        frontrunProtected(keccak256(abi.encodePacked(agentId, dev)), 0 minutes) // TODO: 0 disables the check
    {
        require(dev != address(0), "Address(0) is not allowed");
        require(agentDevs[agentId].remove(dev), "Address is not an agent admin");
        emit AgentDevRemoved(agentId, _msgSender(),  dev);
    }

    /**
     Access modifiers
     */

    function _hasPermission(uint256 agentId) internal virtual override view returns (bool) {
      return agentDevs[agentId].contains(_msgSender()) || super._hasPermission(agentId);
    }

    uint256[49] private __gap;
}
