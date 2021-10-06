// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "./ScannerRegistryCore.sol";

abstract contract ScannerRegistryManaged is ScannerRegistryCore {
    using EnumerableSet for EnumerableSet.AddressSet;

    mapping(uint256 => EnumerableSet.AddressSet) private _managers;

    event ManagerEnabled(uint256 indexed scannerId, address indexed manager, bool enabled);

    modifier onlyManagerOf(uint256 scannerId) {
        require(_managers[scannerId].contains(_msgSender()), "Restricted to scanner owner");
        _;
    }

    /**
     * @dev Managers
     */
    function isManager(uint256 scannerId, address manager) public view virtual returns (bool) {
        return _managers[scannerId].contains(manager);
    }

    function getManagerCount(uint256 scannerId) public view virtual returns (uint256) {
        return _managers[scannerId].length();
    }

    function getManagerAt(uint256 scannerId, uint256 index) public view virtual returns (address) {
        return _managers[scannerId].at(index);
    }

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