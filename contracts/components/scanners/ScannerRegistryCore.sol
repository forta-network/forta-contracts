// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/BitMaps.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";

import "../BaseComponent.sol";

contract ScannerRegistryCore is
    BaseComponent,
    ERC721Upgradeable
{
    using EnumerableSet for EnumerableSet.AddressSet;

    mapping(uint256 => EnumerableSet.AddressSet) private _managers;

    event ManagerEnabled(uint256 indexed scanner, address indexed manager, bool enabled);

    modifier onlyOwnerOf(uint256 scannerId) {
        require(_msgSender() == ownerOf(scannerId), "Restricted to scanner owner");
        _;
    }

    modifier onlyManagerOf(uint256 scannerId) {
        require(_managers[scannerId].contains(_msgSender()), "Restricted to scanner owner");
        _;
    }

    function adminRegister(uint256 scannerId, address owner) public onlyRole(AGENT_ADMIN_ROLE) {
        _mint(owner, scannerId);
        _emitHook(abi.encodeWithSignature("hook_afterScannerRegistered(uint256)", scannerId));
    }

    function register(address owner) public {
        uint256 scannerId = uint256(uint160(_msgSender()));
        _mint(owner, scannerId);
        _emitHook(abi.encodeWithSignature("hook_afterScannerRegistered(uint256)", scannerId));
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
}