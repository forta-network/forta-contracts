// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "./NodeRunnerRegistryCore.sol";

abstract contract NodeRunnerRegistryManaged is NodeRunnerRegistryCore {
    using EnumerableSet for EnumerableSet.AddressSet;

    mapping(uint256 => EnumerableSet.AddressSet) private _managers;

    event ManagerEnabled(uint256 indexed nodeRunnerId, address indexed manager, bool enabled);

    error SenderNotManager(address sender, uint256 nodeRunnerId);

    /**
     * @notice Checks sender (or metatx signer) is manager of the scanner token.
     * @param nodeRunnerId ERC721 token id of the scanner.
     */
    modifier onlyManagerOf(uint256 nodeRunnerId) {
        if (!_managers[nodeRunnerId].contains(_msgSender())) revert SenderNotManager(_msgSender(), nodeRunnerId);
        _;
    }

    /**
     * @notice Checks if address is defined as a manager for a scanner.
     * @param nodeRunnerId ERC721 token id of the scanner.
     * @param manager address to check.
     * @return true if defined as manager for scanner, false otherwise.
     */
    function isManager(uint256 nodeRunnerId, address manager) public view virtual returns (bool) {
        return _managers[nodeRunnerId].contains(manager);
    }

    /**
     * @notice Gets total managers defined for a scanner.
     * @dev helper for external iteration.
     * @param nodeRunnerId ERC721 token id of the scanner.
     * @return total managers defined for a scanner.
     */
    function getManagerCount(uint256 nodeRunnerId) public view virtual returns (uint256) {
        return _managers[nodeRunnerId].length();
    }

    /**
     * @notice Gets manager address at certain position of the scanner's manager set.
     * @dev helper for external iteration.
     * @param nodeRunnerId ERC721 token id of the scanner.
     * @param index position in the set.
     * @return address of the manager at index.
     */
    function getManagerAt(uint256 nodeRunnerId, uint256 index) public view virtual returns (address) {
        return _managers[nodeRunnerId].at(index);
    }

    /**
     * @notice Adds or removes a manager to a certain scanner. Restricted to scanner owner.
     * @param nodeRunnerId ERC721 token id of the scanner.
     * @param manager address to be added or removed fromm manager list for the scanner.
     * @param enable true for adding, false for removing.
     */
    function setManager(uint256 nodeRunnerId, address manager, bool enable) public onlyOwnerOf(nodeRunnerId) {
        if (enable) {
            _managers[nodeRunnerId].add(manager);
        } else {
            _managers[nodeRunnerId].remove(manager);
        }
        emit ManagerEnabled(nodeRunnerId, manager, enable);
    }

    uint256[49] private __gap;
}