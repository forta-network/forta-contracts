// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "./ScannerRegistryCore.sol";

abstract contract ScannerRegistryManaged is ScannerRegistryCore {
    using EnumerableSet for EnumerableSet.AddressSet;

    mapping(uint256 => EnumerableSet.AddressSet) private _managers;

    event ManagerEnabled(uint256 indexed scannerId, address indexed manager, bool enabled);

    error SenderNotManager(address sender, uint256 scannerId);

    /**
     * @notice Checks sender (or metatx signer) is manager of the scanner token.
     * @param scannerId ERC1155 token id of the scanner.
     */
    modifier onlyManagerOf(uint256 scannerId) {
        if (!_managers[scannerId].contains(_msgSender())) revert SenderNotManager(_msgSender(), scannerId);
        _;
    }

    /**
     * @notice Checks if address is defined as a manager for a scanner.
     * @param scannerId ERC1155 token id of the scanner.
     * @param manager address to check.
     * @return true if defined as manager for scanner, false otherwise.
     */
    function isManager(uint256 scannerId, address manager) public view virtual returns (bool) {
        return _managers[scannerId].contains(manager);
    }

    /**
     * @notice Gets total managers defined for a scanner.
     * @dev helper for external iteration.
     * @param scannerId ERC1155 token id of the scanner.
     * @return total managers defined for a scanner.
     */
    function getManagerCount(uint256 scannerId) public view virtual returns (uint256) {
        return _managers[scannerId].length();
    }

    /**
     * @notice Gets manager address at certain position of the scanner's manager set.
     * @dev helper for external iteration.
     * @param scannerId ERC1155 token id of the scanner.
     * @param index position in the set.
     * @return address of the manager at index.
     */
    function getManagerAt(uint256 scannerId, uint256 index) public view virtual returns (address) {
        return _managers[scannerId].at(index);
    }

    /**
     * @notice Adds or removes a manager to a certain scanner. Restricted to scanner owner.
     * @param scannerId ERC1155 token id of the scanner.
     * @param manager address to be added or removed fromm manager list for the scanner.
     * @param enable true for adding, false for removing.
     */
    function setManager(uint256 scannerId, address manager, bool enable) public onlyOwnerOf(scannerId) {
        if (enable) {
            _managers[scannerId].add(manager);
        } else {
            _managers[scannerId].remove(manager);
        }
        emit ManagerEnabled(scannerId, manager, enable);
    }

    uint256[49] private __gap;
}