// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/BitMaps.sol";

import "./ScannerRegistryManaged.sol";

abstract contract ScannerRegistryEnable is ScannerRegistryManaged {
    using BitMaps for BitMaps.BitMap;

    enum Permission {
        ADMIN,
        SELF,
        OWNER,
        MANAGER,
        length
    }

    mapping(uint256 => BitMaps.BitMap) private _disabled;

    event ScannerEnabled(uint256 indexed scannerId, bool indexed enabled, Permission permission, bool value);

    /**
     * @dev Enable/Disable scaner
     */
    function isEnabled(uint256 scannerId) public view virtual returns (bool) {
        return _disabled[scannerId]._data[0] == 0; // Permission.length < 256 → we don't have to loop
    }

    function enableScanner(uint256 scannerId, Permission permission) public virtual {
        require(_hasPermission(scannerId, permission), "invalid permission");
        _enable(scannerId, permission, true);
    }

    function disableScanner(uint256 scannerId, Permission permission) public virtual {
        require(_hasPermission(scannerId, permission), "invalid permission");
        _enable(scannerId, permission, false);
    }

    function _hasPermission(uint256 scannerId, Permission permission) internal view returns (bool) {
        if (permission == Permission.ADMIN)   { return hasRole(SCANNER_ADMIN_ROLE, _msgSender()); }
        if (permission == Permission.SELF)    { return uint256(uint160(_msgSender())) == scannerId; }
        if (permission == Permission.OWNER)   { return _msgSender() == ownerOf(scannerId); }
        if (permission == Permission.MANAGER) { return isManager(scannerId, _msgSender()); }
        return false;
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
    function _beforeScannerEnable(uint256 scannerId, Permission permission, bool value) internal virtual {
    }

    function _scannerEnable(uint256 scannerId, Permission permission, bool value) internal virtual {
        _disabled[scannerId].setTo(uint8(permission), !value);
        emit ScannerEnabled(scannerId, isEnabled(scannerId), permission, value);
    }

    function _afterScannerEnable(uint256 scannerId, Permission permission, bool value) internal virtual {
        _emitHook(abi.encodeWithSignature("hook_afterScannerEnable(uint256)", scannerId));
    }

    uint256[49] private __gap;
}
