// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/structs/BitMaps.sol";
import "./ScannerRegistryManaged.sol";

/**
* @dev ScannerRegistry methods and state handling disabling and enabling scanners, and
* recognizing stake changes that might disable a scanner.
* NOTE: This contract was deployed before StakeAwareUpgradeable was created, so __StakeAwareUpgradeable_init
* is not called.
*/
abstract contract ScannerRegistryEnable is ScannerRegistryManaged {
    using BitMaps for BitMaps.BitMap;

    enum Permission {
        ADMIN,
        SELF,
        OWNER,
        MANAGER,
        length
    }

    mapping(uint256 => BitMaps.BitMap) internal _disabled;

    event ScannerEnabled(uint256 indexed scannerId, bool indexed enabled, Permission permission, bool value);

    /**
    * @notice Check if scanner is enabled
    * @param scannerId ERC721 token id of the scanner.
    * @return true if the scanner is registered, has not been disabled, and is staked over minimum value.
    * Returns false if otherwise
    */
    function isEnabled(uint256 scannerId) public view virtual returns (bool) {
        return isRegistered(scannerId) &&
            _getDisableFlags(scannerId) == 0 &&
            _isStakedOverMin(scannerId); 
    }

    /**
     * @notice Public method to enable a scanner, if caller has permission. Scanner must be staked over minimum defined
     * for the scanner's chainId.
     * @param scannerId ERC721 token id of the scanner.
     * @param permission the caller claims to have.
     */
    function enableScanner(uint256 scannerId, Permission permission) public virtual {
        if (!_hasPermission(scannerId, permission)) revert DoesNotHavePermission(_msgSender(), uint8(permission), scannerId);
        _enable(scannerId, permission, true);
    }

    /**
     * @notice Public method to disable a scanner, if caller has permission.
     * @param scannerId ERC721 token id of the scanner.
     * @param permission the caller claims to have.
     */
    function disableScanner(uint256 scannerId, Permission permission) public virtual {
        if (!_hasPermission(scannerId, permission)) revert DoesNotHavePermission(_msgSender(), uint8(permission), scannerId);
        _enable(scannerId, permission, false);
    }

    /**
     * Get the disabled flags for an agentId. Permission (uint8) is used for indexing, so we don't
     * need to loop. 
     * If not disabled, all flags will be 0
     * @param scannerId ERC721 token id of the scanner.
     * @return uint256 containing the byte flags.
     */
    function _getDisableFlags(uint256 scannerId) internal view returns (uint256) {
        return _disabled[scannerId]._data[0];
    }

    /**
     * @notice Method that does permission checks.
     * @dev AccessManager is not used since the permission is specific for scannerId
     * @param scannerId ERC721 token id of the scanner.
     * @param permission the caller claims to have.
     * @return true if (ADMIN and _msgSender() has SCANNER_ADMIN_ROLE), if _msgSender() is the scanner itself, its owner
     * or manager for each respective permission, false otherwise.
     */
    function _hasPermission(uint256 scannerId, Permission permission) internal view returns (bool) {
        if (permission == Permission.ADMIN)   { return hasRole(SCANNER_ADMIN_ROLE, _msgSender()); }
        if (permission == Permission.SELF)    { return uint256(uint160(_msgSender())) == scannerId; }
        if (permission == Permission.OWNER)   { return _msgSender() == ownerOf(scannerId); }
        if (permission == Permission.MANAGER) { return isManager(scannerId, _msgSender()); }
        return false;
    }

    /**
     * @notice Internal method to enable a scanner.
     * @dev will trigger _before and _after enable hooks within the inheritance tree.
     * @param scannerId ERC721 token id of the scanner.
     * @param permission the caller claims to have.
     * @param enable true for enabling, false for disabling
     */
    function _enable(uint256 scannerId, Permission permission, bool enable) internal {
        if (!isRegistered(scannerId)) revert ScannerNotRegistered(address(uint160(scannerId)));
        _disabled[scannerId].setTo(uint8(permission), !enable);
        emit ScannerEnabled(scannerId, isEnabled(scannerId), permission, enable);
    }

    /**
     * Obligatory inheritance dismambiguation of ForwardedContext's _msgSender()
     * @return sender msg.sender if not a meta transaction, signer of forwarder metatx if it is.
     */
    function _msgSender() internal view virtual override(ScannerRegistryCore) returns (address sender) {
        return super._msgSender();
    }
    /**
     * Obligatory inheritance dismambiguation of ForwardedContext's _msgSender()
     * @return sender msg.data if not a meta transaction, forwarder data in metatx if it is.
     */
    function _msgData() internal view virtual override(ScannerRegistryCore) returns (bytes calldata) {
        return super._msgData();
    }

    /**
     *  50
     * - 1 _disabled;
     * --------------------------
     *  49 __gap
     */
    uint256[49] private __gap;
}
