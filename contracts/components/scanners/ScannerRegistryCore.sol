// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";

import "../BaseComponentUpgradeable.sol";
import "../staking/StakeSubject.sol";
import "../../errors/GeneralErrors.sol";

abstract contract ScannerRegistryCore is
    BaseComponentUpgradeable,
    ERC721Upgradeable,
    StakeSubjectUpgradeable
{
    mapping(uint256 => StakeThreshold) internal _stakeThresholds;
    
    event ScannerUpdated(uint256 indexed scannerId, uint256 indexed chainId, string metadata);
    event StakeThresholdChanged(uint256 indexed chainId, uint256 min, uint256 max, bool activated);
    
    error ScannerNotRegistered(address scanner);
    error PublicRegistrationDisabled(uint256 chainId);

    /**
     * @notice Checks sender (or metatx signer) is owner of the scanner token.
     * @param scannerId ERC721 token id of the scanner.
     */
    modifier onlyOwnerOf(uint256 scannerId) {
        if (_msgSender() != ownerOf(scannerId)) revert SenderNotOwner(_msgSender(), scannerId);
        _;
    }

    /**
     * @notice Scanner registration via admin key.
     * @dev restricted to SCANNER_ADMIN_ROLE. Scanner address will be converted to uin256 ERC721 token id.
     * @param scanner address generated by scanner software.
     * @param owner of the scanner. Will have admin privileges over the registering scanner.
     * @param chainId that the scanner will monitor.
     * @param metadata IPFS pointer to scanner's metadata JSON
     */
    function adminRegister(address scanner, address owner, uint256 chainId, string calldata metadata) public onlyRole(SCANNER_ADMIN_ROLE) {
        _register(scanner, owner, chainId, metadata);
    }

    /**
     * @notice Checks if scannerId has been registered (minted).
     * @param scannerId ERC721 token id of the scanner.
     * @return true if scannerId exists, false otherwise.
     */
    function isRegistered(uint256 scannerId) public view override returns(bool) {
        return _exists(scannerId);
    }

    /**
     * @notice Public method for scanners to self register in Forta and mint registration ERC721 token.
     * @dev _msgSender() will be considered the Scanner Node address.
     * @param owner of the scanner. Will have admin privileges over the registering scanner.
     * @param chainId that the scanner will monitor.
     * @param metadata IPFS pointer to scanner's metadata JSON
     */
    function register(address owner, uint256 chainId, string calldata metadata) virtual public {
        if (!(_stakeThresholds[chainId].activated)) revert PublicRegistrationDisabled(chainId);
        _register(_msgSender(), owner, chainId, metadata);
    }

    /**
     * @notice Internal method for scanners to self register in Forta and mint registration ERC721 token.
     * Public staking must be activated in the target chainId.
     * @dev Scanner address will be converted to uin256 ERC721 token id. Will trigger _before and _after hooks within
     * the inheritance tree.
     * @param owner of the scanner. Will have admin privileges over the registering scanner.
     * @param chainId that the scanner will monitor.
     * @param metadata IPFS pointer to scanner's metadata JSON
     */
    function _register(address scanner, address owner, uint256 chainId, string calldata metadata) internal {
        uint256 scannerId = scannerAddressToId(scanner);
        _mint(owner, scannerId);

        _beforeScannerUpdate(scannerId, chainId, metadata);
        _scannerUpdate(scannerId, chainId, metadata);
        _afterScannerUpdate(scannerId, chainId, metadata);
    }

    /**
     * @notice Allows the admin to update chainId and metadata.
     * @dev Restricted to SCANNER_ADMIN_ROLE. Will trigger _before and _after hooks within the inheritance tree.
     * @param scanner address of the Scanner Node.
     * @param chainId that the scanner will monitor.
     * @param metadata IPFS pointer to scanner's metadata JSON
     */
    function adminUpdate(address scanner, uint256 chainId, string calldata metadata) public onlyRole(SCANNER_ADMIN_ROLE) {
        uint256 scannerId = scannerAddressToId(scanner);
        if (!isRegistered(scannerId)) revert ScannerNotRegistered(scanner);
        _beforeScannerUpdate(scannerId, chainId, metadata);
        _scannerUpdate(scannerId, chainId, metadata);
        _afterScannerUpdate(scannerId, chainId, metadata);
    }

    /// Converts scanner address to uint256 for ERC721 Token Id.
    function scannerAddressToId(address scanner) public pure returns(uint256) {
        return uint256(uint160(scanner));
    }

    /**
     * @notice Sets stake parameters (min, max, activated) for a `chainId`. Restricted to SCANNER_ADMIN_ROLE
     * @param newStakeThreshold struct with stake parameters.
     * @param chainId chain the parameters will affect.
     */
    function setStakeThreshold(StakeThreshold calldata newStakeThreshold, uint256 chainId) external onlyRole(SCANNER_ADMIN_ROLE) {
        if (newStakeThreshold.max <= newStakeThreshold.min) revert StakeThresholdMaxLessOrEqualMin();
        emit StakeThresholdChanged(chainId, newStakeThreshold.min, newStakeThreshold.max, newStakeThreshold.activated);
        _stakeThresholds[chainId] = newStakeThreshold;
    }

    /**
     * @dev internal getter for _getStakeThreshold, inheriting contracts may define logic to associate
     * a scanner with a StakeThreshold
     */
    function _getStakeThreshold(uint256 subject) internal virtual view returns(StakeThreshold memory);

    /**
     * @notice Getter for StakeThreshold for the scanner with id `subject`
     */
    function getStakeThreshold(uint256 subject) external view returns(StakeThreshold memory) {
        return _getStakeThreshold(subject);
    }

    /**
     * Checks if scanner is staked over minimum stake
     * @param scannerId scanner
     * @return true if scanner is staked over the minimum threshold for that chainId and is registered,
     * or staking is not yet enabled (stakeController = 0).
     * false otherwise
     */
    function _isStakedOverMin(uint256 scannerId) internal virtual override view returns(bool) {
        if (address(getStakeController()) == address(0)) {
            return true;
        }
        return getStakeController().activeStakeFor(SCANNER_SUBJECT, scannerId) >= _getStakeThreshold(scannerId).min && _exists(scannerId);
    }

    /**
     * @notice _before hook triggered before scanner creation or update.
     * @dev Does nothing in this base contract.
     * @param scannerId ERC721 token id of the scanner.
     * @param chainId that the scanner will monitor.
     * @param metadata IPFS pointer to scanner's metadata JSON
    */
    function _beforeScannerUpdate(uint256 scannerId, uint256 chainId, string calldata metadata) internal virtual {
    }

    /**
     * @notice Scanner update logic.
     * @dev Emits ScannerUpdated(scannerId, chainId, metadata)
     * @param scannerId ERC721 token id of the scanner.
     * @param chainId that the scanner will monitor.
     * @param metadata IPFS pointer to scanner's metadata JSON
     */
    function _scannerUpdate(uint256 scannerId, uint256 chainId, string calldata metadata) internal virtual {
        emit ScannerUpdated(scannerId, chainId, metadata);
    }

    /**
     * @notice _after hook triggered after scanner creation or update.
     * @dev emits Router hook
     * @param scannerId ERC721 token id of the scanner.
     * @param chainId that the scanner will monitor.
     * @param metadata IPFS pointer to scanner's metadata JSON
     */
    function _afterScannerUpdate(uint256 scannerId, uint256 chainId, string calldata metadata) internal virtual {
        _emitHook(abi.encodeWithSignature("hook_afterScannerUpdate(uint256,uint256,string)", scannerId, chainId, metadata));
    }

    /**
     * @notice Helper to get either msg msg.sender if not a meta transaction, signer of forwarder metatx if it is.
     * @inheritdoc ForwardedContext
     */
    function _msgSender() internal view virtual override(BaseComponentUpgradeable, ContextUpgradeable) returns (address sender) {
        return super._msgSender();
    }

    /**
     * @notice Helper to get msg.data if not a meta transaction, forwarder data in metatx if it is.
     * @inheritdoc ForwardedContext
     */
    function _msgData() internal view virtual override(BaseComponentUpgradeable, ContextUpgradeable) returns (bytes calldata) {
        return super._msgData();
    }

    uint256[44] private __gap; // 50 - 1 (_stakeThresholds) - 5 (StakeSubjectUpgradeable)
}