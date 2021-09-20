// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/BitMaps.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";

import "../BaseComponent.sol";

contract ScannerRegistryCore is BaseComponent, ERC721Upgradeable
{
    using BitMaps for BitMaps.BitMap;
    using EnumerableSet for EnumerableSet.AddressSet;

    enum Permission {
        ADMIN,
        SELF,
        OWNER,
        MANAGER,
        length
    }

    mapping(uint256 => BitMaps.BitMap) private _disabled;
    mapping(uint256 => EnumerableSet.AddressSet) private _managers;

    event ScannerEnabled(uint256 indexed scanner, Permission permission, bool enabled);

    modifier onlyOwnerOf(uint256 scannerId) {
        require(_msgSender() == ownerOf(scannerId), "Restricted to scanner owner");
        _;
    }

    modifier onlyManagerOf(uint256 scannerId) {
        require(_managers[scannerId].contains(_msgSender()), "Restricted to scanner owner");
        _;
    }

    function register(address owner) public {
        uint256 scannerId = uint256(uint160(_msgSender()));
        _mint(owner, scannerId);

        _emitHook(abi.encodeWithSignature("hook_afterScannerRegistered(uint256)", scannerId));
    }

    function setManager(uint256 scannerId, address manager, bool enable) public onlyOwnerOf(scannerId) {
        if (enable) {
            _managers[scannerId].add(manager);
        } else {
            _managers[scannerId].remove(manager);
        }
    }

    /**
     * @dev Enable/Disable scaner
     */
    function isEnabled(uint256 scannerId) public view virtual returns (bool) {
        return _disabled[scannerId]._data[0] == 0; // Permission.length < 256 → we don't have to loop
    }

    function enableAgent(uint256 scannerId, Permission permission) public virtual {
        if (permission == Permission.ADMIN)   { require(hasRole(AGENT_ADMIN_ROLE, _msgSender())); }
        if (permission == Permission.SELF)    { require(uint256(uint160(_msgSender())) == scannerId); }
        if (permission == Permission.OWNER)   { require(_msgSender() == ownerOf(scannerId)); }
        if (permission == Permission.MANAGER) { require(_managers[scannerId].contains(_msgSender())); }
        _enable(scannerId, permission, true);
    }

    function disableAgent(uint256 scannerId, Permission permission) public virtual {
        if (permission == Permission.ADMIN)   { require(hasRole(AGENT_ADMIN_ROLE, _msgSender())); }
        if (permission == Permission.SELF)    { require(uint256(uint160(_msgSender())) == scannerId); }
        if (permission == Permission.OWNER)   { require(_msgSender() == ownerOf(scannerId)); }
        if (permission == Permission.MANAGER) { require(_managers[scannerId].contains(_msgSender())); }
        _enable(scannerId, permission, false);
    }

    function _enable(uint256 scannerId, Permission permission, bool enable) internal {
        _beforeScannerEnable(scannerId, permission, enable);
        _scannerEnable(scannerId, permission, enable);
        _afterScannerEnable(scannerId, permission, enable);
    }

    function _getDisableFlags(uint256 scannerId) internal view returns (uint256) {
        return _disabled[scannerId]._data[0];
    }

    /**
     * Hook: Scanner is enabled/disabled
     */
    function _beforeScannerEnable(uint256 scannerId, Permission permission, bool enable) internal virtual {
    }

    function _scannerEnable(uint256 scannerId, Permission permission, bool enable) internal virtual {
        _disabled[scannerId].setTo(uint8(permission), !enable);
        emit ScannerEnabled(scannerId, permission, enable);
    }

    function _afterScannerEnable(uint256 scannerId, Permission /*permission*/, bool /*enable*/) internal virtual {
        _emitHook(abi.encodeWithSignature("hook_afterScannerEnable(uint256)", scannerId));
    }
}