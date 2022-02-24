// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/BitMaps.sol";

import "./ScannerRegistryManaged.sol";
import "../staking/StakeSubject.sol";

abstract contract ScannerRegistryEnable is ScannerRegistryManaged, StakeSubjectUpgradeable {
    using BitMaps for BitMaps.BitMap;

    enum Permission {
        ADMIN,
        SELF,
        OWNER,
        MANAGER,
        length
    }

    mapping(uint256 => BitMaps.BitMap) private _disabled;
    mapping(uint256 => StakeThreshold) internal _stakeThresholds;

    event ScannerEnabled(uint256 indexed scannerId, bool indexed enabled, Permission permission, bool value);
    event StakeThresholdChanged(uint256 indexed chainId, uint256 min, uint256 max);

    /**
    * Check if scanner is enabled
    * @param scannerId token Id
    * @return true if the scanner is registered, has not been disabled, and is staked over minimum value.
    * Returns false if otherwise
    */
    function isEnabled(uint256 scannerId) public view virtual returns (bool) {
        return isRegistered(scannerId) &&
            _getDisableFlags(scannerId) == 0 &&
            _isStakedOverMin(scannerId); 
    }

    function register(address owner, uint256 chainId, string calldata metadata) virtual override public {
        require(_stakeThresholds[chainId].min > 0, "ScannerRegistryEnable: public registration available if staking activated");
        super.register(owner, chainId, metadata);
    }

    /**
     * @dev Enable/Disable scaner
     */
    function enableScanner(uint256 scannerId, Permission permission) public virtual {
        require(_isStakedOverMin(scannerId), "ScannerRegistryEnable: scanner staked under minimum");
        require(_hasPermission(scannerId, permission), "ScannerRegistryEnable: invalid permission");
        _enable(scannerId, permission, true);
    }

    function disableScanner(uint256 scannerId, Permission permission) public virtual {
        require(_hasPermission(scannerId, permission), "ScannerRegistryEnable: invalid permission");
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

    /**
     * Get the disabled flags for an agentId. Permission (uint8) is used for indexing, so we don't
     * need to loop. 
     * If not disabled, all flags will be 0
     */
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

    /**
    * Stake
    */
    function setStakeThreshold(StakeThreshold calldata newStakeThreshold, uint256 chainId) external onlyRole(SCANNER_ADMIN_ROLE) {
        require(newStakeThreshold.max > newStakeThreshold.min, "ScannerRegistryEnable: StakeThreshold max <= min");
        emit StakeThresholdChanged(chainId, newStakeThreshold.min, newStakeThreshold.max);
        _stakeThresholds[chainId] = newStakeThreshold;
    }

    /**
     * Overrides
     */
    function _msgSender() internal view virtual override(ContextUpgradeable, ScannerRegistryCore) returns (address sender) {
        return super._msgSender();
    }

    function _msgData() internal view virtual override(ContextUpgradeable, ScannerRegistryCore) returns (bytes calldata) {
        return super._msgData();
    }

    uint256[48] private __gap;
}
