// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/BitMaps.sol";

import "./ScannerRegistryCore.sol";

contract ScannerRegistryEnable is ScannerRegistryCore {
    using BitMaps for BitMaps.BitMap;

    enum Permission {
        ADMIN,
        SELF,
        OWNER,
        MANAGER,
        length
    }

    mapping(uint256 => BitMaps.BitMap) private _disabled;

    event ScannerEnabled(uint256 indexed scanner, Permission permission, bool enabled);

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
        if (permission == Permission.MANAGER) { require(isManager(scannerId, _msgSender())); }
        _enable(scannerId, permission, true);
    }

    function disableAgent(uint256 scannerId, Permission permission) public virtual {
        if (permission == Permission.ADMIN)   { require(hasRole(AGENT_ADMIN_ROLE, _msgSender())); }
        if (permission == Permission.SELF)    { require(uint256(uint160(_msgSender())) == scannerId); }
        if (permission == Permission.OWNER)   { require(_msgSender() == ownerOf(scannerId)); }
        if (permission == Permission.MANAGER) { require(isManager(scannerId, _msgSender())); }
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
