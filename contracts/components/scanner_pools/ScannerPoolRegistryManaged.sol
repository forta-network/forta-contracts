// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "./ScannerPoolRegistryCore.sol";

abstract contract ScannerPoolRegistryManaged is ScannerPoolRegistryCore {
    using EnumerableSet for EnumerableSet.AddressSet;

    mapping(uint256 => EnumerableSet.AddressSet) private _managers;

    event ManagerEnabled(uint256 indexed scannerPoolId, address indexed manager, bool enabled);

    error SenderNotManager(address sender, uint256 scannerPoolId);

    /**
     * @notice Checks sender (or metatx signer) is manager of the scanner token.
     * @param scannerPoolId ERC721 token id of the Node Runner
     */
    modifier onlyManagerOf(uint256 scannerPoolId) {
        if (!isManager(scannerPoolId, _msgSender())) revert SenderNotManager(_msgSender(), scannerPoolId);
        _;
    }

    /**
     * @notice Checks if address is defined as a manager for a Node Runner's registered Scanner Nodes.
     * @param scannerPoolId ERC721 token id of the Node Runner
     * @param manager address to check.
     * @return true if defined as manager for Node Runner, false otherwise.
     */
    function isManager(uint256 scannerPoolId, address manager) public view returns (bool) {
        return _managers[scannerPoolId].contains(manager);
    }

    /**
     * @notice Gets total managers defined for a Node Runner's registered Scanner Nodes.
     * @dev helper for external iteration.
     * @param scannerPoolId ERC721 token id of the Node Runner
     * @return total managers defined for a Node Runner.
     */
    function getManagerCount(uint256 scannerPoolId) public view virtual returns (uint256) {
        return _managers[scannerPoolId].length();
    }

    /**
     * @notice Gets manager address at certain position of the Node Runner's registered Scanner Nodes.
     * @dev helper for external iteration.
     * @param scannerPoolId ERC721 token id of the Node Runner
     * @param index position in the set.
     * @return address of the manager at index.
     */
    function getManagerAt(uint256 scannerPoolId, uint256 index) public view virtual returns (address) {
        return _managers[scannerPoolId].at(index);
    }

    /**
     * @notice Adds or removes a manager to a certain Node Runner's registered Scanner Nodes. Restricted to NodeRunerRegistry owner.
     * @param scannerPoolId ERC721 token id of the Node Runner
     * @param manager address to be added or removed from manager list for the Node Runner.
     * @param enable true for adding, false for removing.
     */
    function setManager(uint256 scannerPoolId, address manager, bool enable) public onlyScannerPool(scannerPoolId) {
        if (enable) {
            _managers[scannerPoolId].add(manager);
        } else {
            _managers[scannerPoolId].remove(manager);
        }
        emit ManagerEnabled(scannerPoolId, manager, enable);
    }

    function _canSetEnableState(address scanner) internal virtual override view returns (bool) {
        return super._canSetEnableState(scanner) || isManager(_scannerNodes[scanner].scannerPoolId, _msgSender());
    }


    uint256[49] private __gap;
}