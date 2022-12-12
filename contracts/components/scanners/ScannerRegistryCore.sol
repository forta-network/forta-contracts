// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";

import "../BaseComponentUpgradeable.sol";
import "../staking/stake_subjects/DirectStakeSubject.sol";
import "../../errors/GeneralErrors.sol";
import "../scanner_pools/ScannerPoolRegistry.sol";

abstract contract ScannerRegistryCore is
    BaseComponentUpgradeable,
    ERC721Upgradeable,
    DirectStakeSubjectUpgradeable
{
    mapping(uint256 => StakeThreshold) internal _stakeThresholds;
    
    event ScannerUpdated(uint256 indexed scannerId, uint256 indexed chainId, string metadata);
    event StakeThresholdChanged(uint256 indexed chainId, uint256 min, uint256 max, bool activated);
    
    error ScannerNotRegistered(address scanner);

    /**
     * @notice Checks sender (or metatx signer) is owner of the scanner token.
     * @param scannerId ERC721 token id of the scanner.
     */
    modifier onlyOwnerOf(uint256 scannerId) {
        if (_msgSender() != ownerOf(scannerId)) revert SenderNotOwner(_msgSender(), scannerId);
        _;
    }

    /**
     * @notice Checks if scannerId has been registered (minted).
     * @param scannerId ERC721 token id of the scanner.
     * @return true if scannerId exists, false otherwise.
     */
    function isRegistered(uint256 scannerId) public view override returns(bool) {
        return _exists(scannerId);
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
        if (address(getSubjectHandler()) == address(0) || !_getStakeThreshold(scannerId).activated) {
            return true;
        }
        return getSubjectHandler().activeStakeFor(SCANNER_SUBJECT, scannerId) >= _getStakeThreshold(scannerId).min && _exists(scannerId);
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

    /**
     * @notice disambiguation of ownerOf.
     * @inheritdoc ERC721Upgradeable
     */
    function ownerOf(uint256 subject) public view virtual override(DirectStakeSubjectUpgradeable, ERC721Upgradeable) returns (address) {
        return super.ownerOf(subject);
    }

    /**
     *  50
     * - 5 StakeSubjectUpgradeable;
     * - 1 _stakeThresholds;
     * --------------------------
     *  44 __gap
     */
    uint256[44] private __gap;
}