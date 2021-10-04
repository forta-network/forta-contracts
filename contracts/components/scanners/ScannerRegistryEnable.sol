// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/BitMaps.sol";

import "./ScannerRegistryManaged.sol";

contract ScannerRegistryEnable is ScannerRegistryManaged {
    using BitMaps for BitMaps.BitMap;

    enum Permission {
        ADMIN,
        SELF,
        OWNER,
        MANAGER,
        length
    }

    mapping(uint256 => BitMaps.BitMap) private _disabled;

    event ScannerEnabled(uint256 indexed scannerId, Permission permission, bool enabled);

    /**
     * @dev Enable/Disable scaner
     */
    function isEnabled(uint256 scannerId) public view virtual returns (bool) {
        return _disabled[scannerId]._data[0] == 0; // Permission.length < 256 → we don't have to loop
    }

    function enableScanner(uint256 scannerId, Permission permission) public virtual {
        require(permission < Permission.length, "invalid permission slot");
        if (permission == Permission.ADMIN)   { require(hasRole(SCANNER_ADMIN_ROLE, _msgSender())); }
        if (permission == Permission.SELF)    { require(uint256(uint160(_msgSender())) == scannerId); }
        if (permission == Permission.OWNER)   { require(_msgSender() == ownerOf(scannerId)); }
        if (permission == Permission.MANAGER) { require(isManager(scannerId, _msgSender())); }
        _enable(scannerId, permission, true);
    }

    function disableScanner(uint256 scannerId, Permission permission) public virtual {
        require(permission < Permission.length, "invalid permission slot");
        if (permission == Permission.ADMIN)   { require(hasRole(SCANNER_ADMIN_ROLE, _msgSender())); }
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

    function _afterScannerEnable(uint256 scannerId, Permission permission, bool enable) internal virtual {
        _emitHook(abi.encodeWithSignature("hook_afterScannerEnable(uint256)", scannerId));
    }

    uint256[49] private __gap;
}
