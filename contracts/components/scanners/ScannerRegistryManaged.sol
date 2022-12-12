// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "./ScannerRegistryCore.sol";

abstract contract ScannerRegistryManaged is ScannerRegistryCore {
    using EnumerableSet for EnumerableSet.AddressSet;

    mapping(uint256 => EnumerableSet.AddressSet) internal _managers;

    event ManagerEnabled(uint256 indexed scannerId, address indexed manager, bool enabled);

    error SenderNotManager(address sender, uint256 scannerId);

    /**
     * @notice Checks sender (or metatx signer) is manager of the scanner token.
     * @param scannerId ERC721 token id of the scanner.
     */
    modifier onlyManagerOf(uint256 scannerId) {
        if (!_managers[scannerId].contains(_msgSender())) revert SenderNotManager(_msgSender(), scannerId);
        _;
    }

    /**
     * @notice Checks if address is defined as a manager for a scanner.
     * @param scannerId ERC721 token id of the scanner.
     * @param manager address to check.
     * @return true if defined as manager for scanner, false otherwise.
     */
    function isManager(uint256 scannerId, address manager) public view virtual returns (bool) {
        return _managers[scannerId].contains(manager);
    }

    /**
     * @notice Gets total managers defined for a scanner.
     * @dev helper for external iteration.
     * @param scannerId ERC721 token id of the scanner.
     * @return total managers defined for a scanner.
     */
    function getManagerCount(uint256 scannerId) public view virtual returns (uint256) {
        return _managers[scannerId].length();
    }

    /**
     * @notice Gets manager address at certain position of the scanner's manager set.
     * @dev helper for external iteration.
     * @param scannerId ERC721 token id of the scanner.
     * @param index position in the set.
     * @return address of the manager at index.
     */
    function getManagerAt(uint256 scannerId, uint256 index) public view virtual returns (address) {
        return _managers[scannerId].at(index);
    }

    /**
     *  50
     * - 1 _managers;
     * --------------------------
     *  49 __gap
     */
    uint256[49] private __gap;
}