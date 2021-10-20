// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/BitMaps.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "./AgentRegistryCore.sol";
abstract contract AgentRegistryDeveloped is AgentRegistryCore {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    mapping(uint256 => EnumerableSetUpgradeable.AddressSet) _agentDevs;
    
    event DeveloperEnabled(uint256 indexed agentId, address indexed developer, bool enabled);

    /**
     * Agent Developer management
     */
    function isDeveloper(uint256 agentId, address developer) public view virtual returns (bool) {
        return _agentDevs[agentId].contains(developer);
    }

    function getDeveloperCount(uint256 agentId) public view virtual returns (uint256) {
        return _agentDevs[agentId].length();
    }

    function getDeveloperAt(uint256 agentId, uint256 index) public view virtual returns (address) {
        return _agentDevs[agentId].at(index);
    }

    function setDeveloper(uint256 agentId, address developer, bool enable) public onlyOwnerOf(agentId) {
        if (enable) {
            _agentDevs[agentId].add(developer);
        } else {
            _agentDevs[agentId].remove(developer);
        }
        emit DeveloperEnabled(agentId, developer, enable);
    }

    /**
     Access modifiers
     */

    function _hasPermission(uint256 agentId) internal virtual override view returns (bool) {
      if (_agentDevs[agentId].contains(_msgSender())) {
        return true;
      } 
      return super._hasPermission(agentId);
    }

    uint256[49] private __gap;
}
