// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/BitMaps.sol";

import "./ScannerRegistryManaged.sol";
import "../utils/MinStakeAware.sol";

abstract contract ScannerRegistryEnable is ScannerRegistryManaged, MinStakeAwareUpgradeable {
    using BitMaps for BitMaps.BitMap;

    enum Permission {
        ADMIN,
        SELF,
        OWNER,
        MANAGER,
        STAKE,
        length
    }

    mapping(uint256 => BitMaps.BitMap) private _disabled;

    event ScannerEnabled(uint256 indexed scannerId, bool indexed enabled, Permission permission, bool value);

    /**
     * @dev Enable/Disable scaner
     */
    function isEnabled(uint256 scannerId) public view virtual returns (bool) {
        // Permission.length < 256 → we don't have to loop
        return _disabled[scannerId]._data[0] == 0 && _isStakedOverMinimum(SCANNER_SUBJECT, scannerId); 
    }

    function enableScanner(uint256 scannerId, Permission permission) public virtual {
        require(_hasPermission(scannerId, permission, true), "invalid permission");
        require(_isStakedOverMinimum(SCANNER_SUBJECT, scannerId), "ScannerRegistryEnable: needs stake over minimum");
        _enable(scannerId, permission, true);
    }

    function disableScanner(uint256 scannerId, Permission permission) public virtual {
        require(_hasPermission(scannerId, permission, false), "invalid permission");
        _enable(scannerId, permission, false);
    }

    function _hasPermission(uint256 scannerId, Permission permission, bool enabling) internal view returns (bool) {
        if (permission == Permission.STAKE && !enabling) { return _isStakedOverMinimum(SCANNER_SUBJECT, scannerId); }
        if (permission == Permission.ADMIN)   { return hasRole(SCANNER_ADMIN_ROLE, _msgSender()); }
        if (permission == Permission.SELF)    { return uint256(uint160(_msgSender())) == scannerId; }
        if (permission == Permission.OWNER)   { return _msgSender() == ownerOf(scannerId); }
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

    function _msgSender() internal view virtual override(ContextUpgradeable, ScannerRegistryCore) returns (address sender) {
        return super._msgSender();
    }

    function _msgData() internal view virtual override(ContextUpgradeable, ScannerRegistryCore) returns (bytes calldata) {
        return super._msgData();
    }


    uint256[49] private __gap;
}
