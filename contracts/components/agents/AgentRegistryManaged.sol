// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "./AgentRegistryCore.sol";

abstract contract AgentRegistryManaged is AgentRegistryCore {
    using EnumerableSet for EnumerableSet.AddressSet;

    mapping(uint256 => EnumerableSet.AddressSet) private _managers;

    event ManagerEnabled(uint256 indexed agentId, address indexed manager, bool enabled);

    error SenderNotManager(address sender, uint256 agentId);

    /**
     * @notice Checks sender (or metatx signer) is manager of the agent.
     * @param agentId ERC721 token id of the agent
     */
    modifier onlyManagerOf(uint256 agentId) {
        if (!isManager(agentId, _msgSender())) revert SenderNotManager(_msgSender(), agentId);
        _;
    }

    /**
     * @notice Checks if address is defined as a manager for an agent.
     * @param agentId ERC721 token id of the agent
     * @param manager address to check.
     * @return true if defined as manager for agent, false otherwise.
     */
    function isManager(uint256 agentId, address manager) public view returns (bool) {
        return _managers[agentId].contains(manager);
    }

    /**
     * @notice Gets total managers defined for an agent.
     * @dev helper for external iteration.
     * @param agentId ERC721 token id of the agent
     * @return total managers defined for an agent.
     */
    function getManagerCount(uint256 agentId) public view virtual returns (uint256) {
        return _managers[agentId].length();
    }

    /**
     * @notice Gets manager address at certain position of the agent.
     * @dev helper for external iteration.
     * @param agentId ERC721 token id of the agent
     * @param index position in the set.
     * @return address of the manager at index.
     */
    function getManagerAt(uint256 agentId, uint256 index) public view virtual returns (address) {
        return _managers[agentId].at(index);
    }

    /**
     * @notice Adds or removes a manager to a certain agent. Restricted to agent owner.
     * @param agentId ERC721 token id of the agent
     * @param manager address to be added or removed from manager list for the agent.
     * @param enable true for adding, false for removing.
     */
    function setManager(uint256 agentId, address manager, bool enable) public onlyOwnerOf(agentId) {
        if (enable) {
            _managers[agentId].add(manager);
        } else {
            _managers[agentId].remove(manager);
        }
        emit ManagerEnabled(agentId, manager, enable);
    }

    function _canUpdateAgent(uint256 agentId) internal virtual override view returns (bool) {
        return super._canUpdateAgent(agentId) || isManager(agentId, _msgSender());
    }

    /**
     *  50
     * - 1 _managers
     * --------------------------
     *  49 __gap
     */
    uint256[49] private __gap;
}