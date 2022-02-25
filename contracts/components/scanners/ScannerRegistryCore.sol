// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";

import "../BaseComponentUpgradeable.sol";
import "../staking/StakeSubject.sol";

abstract contract ScannerRegistryCore is
    BaseComponentUpgradeable,
    ERC721Upgradeable,
    StakeSubjectUpgradeable
{
    mapping(uint256 => StakeThreshold) internal _stakeThresholds;
    
    event ScannerUpdated(uint256 indexed scannerId, uint256 indexed chainId, string metadata);
    event StakeThresholdChanged(uint256 indexed chainId, uint256 min, uint256 max);

    modifier onlyOwnerOf(uint256 scannerId) {
        require(_msgSender() == ownerOf(scannerId), "ScannerRegistryCore: Restricted to scanner owner");
        _;
    }

    function adminRegister(address scanner, address owner, uint256 chainId, string calldata metadata) public onlyRole(SCANNER_ADMIN_ROLE) {
        _register(scanner, owner, chainId, metadata);
    }

    function isRegistered(uint256 scannerId) public view returns(bool) {
        return _exists(scannerId);
    }

    function register(address owner, uint256 chainId, string calldata metadata) virtual public {
        require(_stakeThresholds[chainId].min > 0, "ScannerRegistryEnable: public registration available if staking activated");
        _register(_msgSender(), owner, chainId, metadata);
    }

    function _register(address scanner, address owner, uint256 chainId, string calldata metadata) internal {
        uint256 scannerId = scannerAddressToId(scanner);
        _mint(owner, scannerId);

        _beforeScannerUpdate(scannerId, chainId, metadata);
        _scannerUpdate(scannerId, chainId, metadata);
        _afterScannerUpdate(scannerId, chainId, metadata);
    }

    function adminUpdate(address scanner, uint256 chainId, string calldata metadata) public onlyRole(SCANNER_ADMIN_ROLE) {
        uint256 scannerId = scannerAddressToId(scanner);
        require(isRegistered(scannerId), "ScannerRegistryCore: scanner must be registered");
        _beforeScannerUpdate(scannerId, chainId, metadata);
        _scannerUpdate(scannerId, chainId, metadata);
        _afterScannerUpdate(scannerId, chainId, metadata);
    }

    function scannerAddressToId(address scanner) public pure returns(uint256) {
        return uint256(uint160(scanner));
    }

    /**
    * Stake
    */
    function setStakeThreshold(StakeThreshold calldata newStakeThreshold, uint256 chainId) external onlyRole(SCANNER_ADMIN_ROLE) {
        require(newStakeThreshold.max > newStakeThreshold.min, "ScannerRegistryEnable: StakeThreshold max <= min");
        emit StakeThresholdChanged(chainId, newStakeThreshold.min, newStakeThreshold.max);
        _stakeThresholds[chainId] = newStakeThreshold;
    }

    function _getStakeThreshold(uint256 subject) internal virtual view returns(StakeThreshold memory);

    function getStakeThreshold(uint256 subject) external view returns(StakeThreshold memory) {
        return _getStakeThreshold(subject);
    }

    /**
     * Checks if scanner is staked over minimium stake
     * @param scannerId scanner
     * @return true if scanner is staked over the minimum threshold for that chainId, or staking is not yet enabled (stakeController = 0).
     * false otherwise
     */
    function _isStakedOverMin(uint256 scannerId) internal virtual override view returns(bool) {
        if (address(getStakeController()) == address(0)) {
            return true;
        }
        return getStakeController().activeStakeFor(SCANNER_SUBJECT, scannerId) >= _getStakeThreshold(scannerId).min;
    }

    /**
     * Hook: Scanner metadata change (create)
     */
    function _beforeScannerUpdate(uint256 scannerId, uint256 chainId, string calldata metadata) internal virtual {
    }

    function _scannerUpdate(uint256 scannerId, uint256 chainId, string calldata metadata) internal virtual {
        emit ScannerUpdated(scannerId, chainId, metadata);
    }

    function _afterScannerUpdate(uint256 scannerId, uint256 chainId, string calldata metadata) internal virtual {
        _emitHook(abi.encodeWithSignature("hook_afterScannerUpdate(uint256,uint256,string)", scannerId, chainId, metadata));
    }

    function _msgSender() internal view virtual override(BaseComponentUpgradeable, ContextUpgradeable) returns (address sender) {
        return super._msgSender();
    }

    function _msgData() internal view virtual override(BaseComponentUpgradeable, ContextUpgradeable) returns (bytes calldata) {
        return super._msgData();
    }

    uint256[44] private __gap; // 50 - 1 (_stakeThresholds) - 5 (StakeSubjectUpgradeable)
}