// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../BaseComponentUpgradeable.sol";
import "./ScannerRegistryCore.sol";
import "./ScannerRegistryManaged.sol";
import "./ScannerRegistryEnable.sol";
import "./ScannerRegistryMetadata.sol";

contract ScannerRegistry is BaseComponentUpgradeable, ScannerRegistryCore, ScannerRegistryManaged, ScannerRegistryEnable, ScannerRegistryMetadata {
    event DeregisteredScanner(uint256 scannerId);
    event ConfiguredMigration(uint256 sunsettingTime, address scannerPoolRegistry);

    string public constant version = "0.1.4";

    mapping(uint256 => bool) public optingOutOfMigration;
    uint256 public sunsettingTime;
    ScannerPoolRegistry public scannerPoolRegistry;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    error CannotDeregister(uint256 scannerId);

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     * @param __name ERC721 token name.
     * @param __symbol ERC721 token symbol.
     */
    function initialize(
        address __manager,
        string calldata __name,
        string calldata __symbol
    ) public initializer {
        __BaseComponentUpgradeable_init(__manager);
        __ERC721_init(__name, __symbol);
    }

    /**
     * @notice Gets all scanner properties and state
     * @param scannerId ERC721 token id of the scanner.
     * @return registered true if scanner exists.
     * @return owner address.
     * @return chainId the scanner is monitoring.
     * @return metadata IPFS pointer for the scanner's JSON metadata.
     * @return enabled true if staked over minimum and not disabled.
     * @return disabledFlags 0 if not disabled, Permission if disabled.
     */
    function getScannerState(uint256 scannerId)
        external
        view
        returns (
            bool registered,
            address owner,
            uint256 chainId,
            string memory metadata,
            bool enabled,
            uint256 disabledFlags
        )
    {
        // If migration has started, and scanner has migrated, return ScannerPoolRegistry values
        if (scannerPoolRegistry.isScannerRegistered(address(uint160(scannerId)))) {
            return _getScannerStateFromScannerPool(scannerId);
        } else {
            return _getScannerState(scannerId);
        }
    }

    function _getScannerStateFromScannerPool(uint256 scannerId)
        private
        view
        returns (
            bool registered,
            address owner,
            uint256 chainId,
            string memory metadata,
            bool enabled,
            uint256 disabledFlags
        )
    {
        bool disabled;
        (registered, owner, chainId, metadata, enabled, disabled) = scannerPoolRegistry.getScannerState(address(uint160(scannerId)));
        if (disabled) {
            disabledFlags = 1;
        }
        return (registered, owner, chainId, metadata, enabled, disabledFlags);
    }

    function _getScannerState(uint256 scannerId)
        private
        view
        returns (
            bool registered,
            address owner,
            uint256 chainId,
            string memory metadata,
            bool enabled,
            uint256 disabledFlags
        )
    {
        (registered, owner, chainId, metadata) = super.getScanner(scannerId);
        return (registered, owner, chainId, metadata, isEnabled(scannerId), _getDisableFlags(scannerId));
    }

    function _getScannerFromScannerPool(uint256 scannerId)
        private
        view
        returns (
            bool registered,
            address owner,
            uint256 chainId,
            string memory metadata
        )
    {
        (registered, owner, chainId, metadata, , ) = scannerPoolRegistry.getScannerState(address(uint160(scannerId)));
        return (registered, owner, chainId, metadata);
    }

    function getScanner(uint256 scannerId)
        public
        view
        virtual
        override
        returns (
            bool registered,
            address owner,
            uint256 chainId,
            string memory metadata
        )
    {
        // If migration has started, and scanner has migrated, return ScannerPoolRegistry values
        if (scannerPoolRegistry.isScannerRegistered(address(uint160(scannerId)))) {
            return _getScannerFromScannerPool(scannerId);
        } else {
            return super.getScanner(scannerId);
        }
    }

    function isEnabled(uint256 scannerId) public view virtual override returns (bool) {
        // after migration, return false
        if (hasMigrationEnded()) {
            return false;
            // During migration, return ScannerPoolRegistry value if scannerId is migrated
        } else if (scannerPoolRegistry.isScannerRegistered(address(uint160(scannerId)))) {
            return scannerPoolRegistry.isScannerOperational(address(uint160(scannerId)));
            // Return ScannerRegistry value if migration has not started or if is not yet migrated
        } else {
            return super.isEnabled(scannerId);
        }
    }

    function hasMigrationEnded() public view returns (bool) {
        return sunsettingTime < block.timestamp;
    }

    function deregisterScannerNode(uint256 scannerId) external onlyRole(SCANNER_2_SCANNER_POOL_MIGRATOR_ROLE) {
        if (optingOutOfMigration[scannerId]) revert CannotDeregister(scannerId);
        _burn(scannerId);
        delete _disabled[scannerId];
        delete _managers[scannerId];
        delete _scannerMetadata[scannerId];
        emit DeregisteredScanner(scannerId);
    }

    /**
     * Declares preference for migration from ScanerRegistry to ScannerPoolRegistry. Default is yes.
     * @param scannerId ERC721 id
     * @param isOut true if the scanner does not want to be migrated to the ScannerPoolRegistry (and deleted)
     */
    function setMigrationPrefrence(uint256 scannerId, bool isOut) external onlyOwnerOf(scannerId) {
        optingOutOfMigration[scannerId] = isOut;
    }

    /*********** Admin methods ***********/

    /**
     * Configures migration params
     * @param _sunsettingTime time after which the scanners won't be operational (isEnabled will return false) and will not get bot assignments or rewards.
     * @param _scannerPoolRegistry new registry, for compatibility for off chain components during migration
     */
    function configureMigration(uint256 _sunsettingTime, address _scannerPoolRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_sunsettingTime == 0) revert ZeroAmount("_sunsettingTime");
        if (_scannerPoolRegistry == address(0)) revert ZeroAddress("_scannerPoolRegistry");
        sunsettingTime = _sunsettingTime;
        scannerPoolRegistry = ScannerPoolRegistry(_scannerPoolRegistry);
        emit ConfiguredMigration(sunsettingTime, _scannerPoolRegistry);
    }

    /**
     * @dev inheritance disambiguation for _getStakeThreshold
     * see ScannerRegistryMetadata
     */
    function _getStakeThreshold(uint256 subject)
        internal
        view
        virtual
        override(ScannerRegistryCore, ScannerRegistryMetadata)
        returns (StakeThreshold memory)
    {
        return super._getStakeThreshold(subject);
    }

    /**
     * @notice Helper to get either msg msg.sender if not a meta transaction, signer of forwarder metatx if it is.
     * @inheritdoc ForwardedContext
     */
    function _msgSender()
        internal
        view
        virtual
        override(BaseComponentUpgradeable, ScannerRegistryCore, ScannerRegistryEnable)
        returns (address sender)
    {
        return super._msgSender();
    }

    /**
     * @notice Helper to get msg.data if not a meta transaction, forwarder data in metatx if it is.
     * @inheritdoc ForwardedContext
     */
    function _msgData()
        internal
        view
        virtual
        override(BaseComponentUpgradeable, ScannerRegistryCore, ScannerRegistryEnable)
        returns (bytes calldata)
    {
        return super._msgData();
    }

    /**
     *  50
     * - 1 optingOutOfMigration;
     * - 1 sunsettingTime;
     * - 1 scannerPoolRegistry;
     * --------------------------
     *  47 __gap
     */
    uint256[47] private __gap;
}
