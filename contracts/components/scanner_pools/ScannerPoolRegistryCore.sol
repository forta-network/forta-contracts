// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../BaseComponentUpgradeable.sol";
import "../staking/allocation/IStakeAllocator.sol";
import "../staking/stake_subjects/DelegatedStakeSubject.sol";
import "../../errors/GeneralErrors.sol";

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/SignatureCheckerUpgradeable.sol";

abstract contract ScannerPoolRegistryCore is BaseComponentUpgradeable, ERC721Upgradeable, ERC721EnumerableUpgradeable, DelegatedStakeSubjectUpgradeable, EIP712Upgradeable {
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using EnumerableSet for EnumerableSet.AddressSet;

    struct ScannerNode {
        bool registered;
        bool disabled;
        uint256 scannerPoolId;
        uint256 chainId;
        string metadata;
    }
    struct ScannerNodeRegistration {
        address scanner;
        uint256 scannerPoolId;
        uint256 chainId;
        string metadata;
        uint256 timestamp;
    }

    bytes32 private constant _SCANNERNODEREGISTRATION_TYPEHASH =
        keccak256("ScannerNodeRegistration(address scanner,uint256 scannerPoolId,uint256 chainId,string metadata,uint256 timestamp)");
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IStakeAllocator private immutable _stakeAllocator;

    /// scannerPoolIds is a sequential autoincremented uint
    CountersUpgradeable.Counter private _scannerPoolIdCounter;
    /// ScannerNode data for each scanner address;
    mapping(address => ScannerNode) internal _scannerNodes;
    /// Set of Scanner Node addresses each scannerPoolId owns;
    mapping(uint256 => EnumerableSet.AddressSet) private _scannerNodeOwnership;
    /// Count of enabled scanners per scannerPoolId (scannerPoolId => total Enabled Scanners)
    mapping(uint256 => uint256) private _enabledScanners;
    /// StakeThreshold of ScannerPools
    mapping(uint256 => StakeThreshold) private _scannerStakeThresholds;
    /// scannerPoolId => chainId. Limitation necessary to calculate stake allocations.
    mapping(uint256 => uint256) private _scannerPoolChainId;
    /// Maximum amount of time allowed from scanner signing a ScannerNodeRegistration and its execution by ScannerPool
    uint256 public registrationDelay;

    event ScannerUpdated(uint256 indexed scannerId, uint256 indexed chainId, string metadata, uint256 scannerPool);
    event ManagedStakeThresholdChanged(uint256 indexed chainId, uint256 min, uint256 max, bool activated);
    event RegistrationDelaySet(uint256 delay);
    // TODO: discuss with the dev team if it breaks compatibility to change 'enabled' too 'operational'
    event ScannerEnabled(uint256 indexed scannerId, bool indexed enabled, address sender, bool disableFlag);
    event EnabledScannersChanged(uint256 indexed scannerPoolId, uint256 enabledScanners);
    event ScannerPoolRegistered(uint256 indexed scannerPoolId, uint256 indexed chainId);

    error ScannerPoolNotRegistered(uint256 scannerPoolId);
    error ScannerExists(address scanner);
    error ScannerNotRegistered(address scanner);
    error PublicRegistrationDisabled(uint256 chainId);
    error RegisteringTooLate();
    error SignatureDoesNotMatch();
    error CannotSetScannerActivation();
    error SenderNotScannerPool(address sender, uint256 scannerPoolId);
    error ChainIdMismatch(uint256 expected, uint256 provided);
    error ActionShutsDownPool();
    error ScannerPreviouslyEnabled(address scanner);
    error ScannerPreviouslyDisabled(address scanner);

    /**
     * @notice Checks sender (or metatx signer) is owner of the ScannerPoolRegistry ERC721 with ID scannerPoolId.
     * @param scannerPoolId ERC721 token id of the ScannerPool.
     */
    modifier onlyScannerPool(uint256 scannerPoolId) {
        if (_msgSender() != ownerOf(scannerPoolId)) revert SenderNotScannerPool(_msgSender(), scannerPoolId);
        _;
    }

    modifier onlyRegisteredScanner(address scanner) {
        if (!isScannerRegistered(scanner)) revert ScannerNotRegistered(scanner);
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address __stakeAllocator) {
        if (__stakeAllocator == address(0)) revert ZeroAddress("__stakeAllocator");
        _stakeAllocator = IStakeAllocator(__stakeAllocator);
    }

    /**
     * @notice Initializer method
     * @param __name ERC721 token name.
     * @param __symbol ERC721 token symbol.
     * @param __stakeSubjectGateway address of StakeSubjectGateway
     * @param __registrationDelay amount of time allowed from scanner signing a ScannerNodeRegistration and it's execution by ScannerPool
     */
    function __ScannerPoolRegistryCore_init(
        string calldata __name,
        string calldata __symbol,
        address __stakeSubjectGateway,
        uint256 __registrationDelay
    ) internal initializer {
        __ERC721_init(__name, __symbol);
        __ERC721Enumerable_init();
        __EIP712_init("ScannerPoolRegistry", "1");
        __StakeSubjectUpgradeable_init(__stakeSubjectGateway);

        _setRegistrationDelay(__registrationDelay);
    }

    // ************* ScannerPool Ownership *************

    /**
     * @notice Checks if scannerPoolId has been registered (minted).
     * @param scannerPoolId ERC721 token id of the ScannerPool.
     * @return true if scannerPoolId exists, false otherwise.
     */
    function isRegistered(uint256 scannerPoolId) public view override returns (bool) {
        return _exists(scannerPoolId);
    }

    /**
     * @notice mints a ScannerPoolRegistry ERC721 NFT to sender
     * Transferring ownership of a ScannerPoolRegistry NFT will transfer ownership of all its registered
     * Scanner Node addresses
     * @return scannerPoolId (autoincremented uint)
     */
    function registerScannerPool(uint256 chainId) external returns (uint256 scannerPoolId) {
        return _registerScannerPool(_msgSender(), chainId);
    }

    function _registerScannerPool(address scannerPoolAddress, uint256 chainId) internal returns (uint256 scannerPoolId) {
        if (scannerPoolAddress == address(0)) revert ZeroAddress("scannerPoolAddress");
        if (chainId == 0) revert ZeroAmount("chainId");
        _scannerPoolIdCounter.increment();
        scannerPoolId = _scannerPoolIdCounter.current();
        _safeMint(scannerPoolAddress, scannerPoolId);
        _scannerPoolChainId[scannerPoolId] = chainId;
        emit ScannerPoolRegistered(scannerPoolId, chainId);
        return scannerPoolId;
    }

    function monitoredChainId(uint256 scannerPoolId) public view returns (uint256) {
        return _scannerPoolChainId[scannerPoolId];
    }

    // ************* Scanner Ownership *************

    /**
     * @notice Checks if scanner address has been registered
     * @param scanner address.
     * @return true if scanner is registered, false otherwise.
     */
    function isScannerRegistered(address scanner) public view returns (bool) {
        return _scannerNodes[scanner].registered;
    }

    /**
     * @notice Checks if scanner address has been registered to a specific scannerPoolId
     * @param scanner address.
     * @param scannerPoolId ERC721 token id of the ScannerPool.
     * @return true if scanner is registered to scannerPoolId, false otherwise.
     */
    function isScannerRegisteredTo(address scanner, uint256 scannerPoolId) public view returns (bool) {
        return _scannerNodeOwnership[scannerPoolId].contains(scanner);
    }

    /**
     * @notice Method to register a Scanner Node and associate it with a scannerPoolId. Before executing this method,
     * make sure to have enough FORT staked by the owner of the Scanner Pool to be allocated to the new scanner,
     * then register a scanner with Forta Scan Node CLI and obtain the parameters for this methods by executing forta auth.
     * Follow the instructions here https://docs.forta.network/en/latest/scanner-quickstart/
     * This method will try to allocate stake from unallocated stake if necessary.
     * Individual ownership of a scaner node is not transferrable.
     * A scanner node can be disabled, but not unregistered
     * @param req ScannerNodeRegistration struct with the Scanner Node data.
     * @param signature ERC712 signature, result from signed req by the scanner.
     */
    function registerScannerNode(ScannerNodeRegistration calldata req, bytes calldata signature) external onlyScannerPool(req.scannerPoolId) {
        if (req.timestamp + registrationDelay < block.timestamp) revert RegisteringTooLate();
        if (
            !SignatureCheckerUpgradeable.isValidSignatureNow(
                req.scanner,
                _hashTypedDataV4(
                    keccak256(abi.encode(_SCANNERNODEREGISTRATION_TYPEHASH, req.scanner, req.scannerPoolId, req.chainId, keccak256(abi.encodePacked(req.metadata)), req.timestamp))
                ),
                signature
            )
        ) revert SignatureDoesNotMatch();
        _registerScannerNode(req);
        // Not called inside _registerScannerNode because it would break registerMigratedScannerNode()
        _allocationOnAddedEnabledScanner(req.scannerPoolId);
    }

    /**
     * @notice Allocates unallocated stake if a there is a new scanner enabled on the pool and not enough allocated stake.
     * If there is not enough unallocated stake, the method will revert.
     * @dev this MUST be called after incrementing _enabledScanners
     * @param scannerPoolId ERC721 id of the node runner
     */
    function _allocationOnAddedEnabledScanner(uint256 scannerPoolId) private {
        uint256 allocatedStake = _stakeAllocator.allocatedStakeFor(SCANNER_POOL_SUBJECT, scannerPoolId);

        // if the owner's allocated stake satisfies the minimum, no need to allocate extra
        uint256 min = _scannerStakeThresholds[_scannerPoolChainId[scannerPoolId]].min;
        if (allocatedStake / _enabledScanners[scannerPoolId] >  min) {
            return;
        }

        uint256 unallocatedStake = _stakeAllocator.unallocatedStakeFor(SCANNER_POOL_SUBJECT, scannerPoolId);
        if ((unallocatedStake + allocatedStake) / _enabledScanners[scannerPoolId] < min) {
            revert ActionShutsDownPool();
        }

        uint256 stakeCapacity = _getStakeAllocationCapacity(scannerPoolId);
        uint256 totalAllocatedStake = _stakeAllocator.allocatedManagedStake(SCANNER_POOL_SUBJECT, scannerPoolId);

        // do not try to allocate more if the total is over the capacity somehow
        if (totalAllocatedStake > stakeCapacity) {
            return; 
        }

        // try to stake up to the remaining capacity
        uint256 stakeToAllocate = stakeCapacity - totalAllocatedStake;

        // make sure that it doesn't exceed the unallocated pool owner stake
        if (stakeToAllocate > unallocatedStake) {
            stakeToAllocate = unallocatedStake;
        }
        _stakeAllocator.allocateOwnStake(SCANNER_POOL_SUBJECT, scannerPoolId, stakeToAllocate);
    }

    /**
     * @notice Unallocates allocated stake if a there is a scanner disabled on the pool and the stake exceeds the max.
     * The amount unallocated is the amount over the max. Unallocates from delegator's allocated stake,
     * then if needed, from owner allocated stake.
     * @dev this MUST be called after decrementing _enabledScanners
     * @param scannerPoolId ERC721 id of the node runner
     */
    function _unallocationOnDisabledScanner(uint256 scannerPoolId) private {
        if (_enabledScanners[scannerPoolId] == 0) { return; }

        uint256 ownerAllocatedStake = _stakeAllocator.allocatedStakeFor(SCANNER_POOL_SUBJECT, scannerPoolId);
        uint256 delegatorAllocatedStake = _stakeAllocator.allocatedStakeFor(DELEGATOR_SCANNER_POOL_SUBJECT, scannerPoolId);
        uint256 totalAllocatedStake = ownerAllocatedStake + delegatorAllocatedStake;
        uint256 stakeCapacity = _getStakeAllocationCapacity(scannerPoolId);

        if (totalAllocatedStake <= stakeCapacity) { return; }

        uint256 stakeToUnallocate = totalAllocatedStake - stakeCapacity;

        // if delegator allocation covers the amount, just unallocate from there
        if(delegatorAllocatedStake >= stakeToUnallocate) {
            _stakeAllocator.unallocateDelegatorStake(SCANNER_POOL_SUBJECT, scannerPoolId, stakeToUnallocate);
            return;
        }
        // delegator allocation does not cover the extra: unallocate all of the delegator stake first
        if (delegatorAllocatedStake > 0) {
            _stakeAllocator.unallocateDelegatorStake(SCANNER_POOL_SUBJECT, scannerPoolId, delegatorAllocatedStake);
            stakeToUnallocate -= delegatorAllocatedStake;
        }
        // unallocate the remaining from the owner
        _stakeAllocator.unallocateOwnStake(SCANNER_POOL_SUBJECT, scannerPoolId, stakeToUnallocate);
    }

    /**
     * @notice Returns the max allocatable stake to the pool.
     * @dev this MUST be called after mutating _enabledScanners
     * @param scannerPoolId ERC721 id of the node runner
     */
    function _getStakeAllocationCapacity(uint256 scannerPoolId) private view returns (uint256) {
        return _scannerStakeThresholds[_scannerPoolChainId[scannerPoolId]].max * _enabledScanners[scannerPoolId];
    }

    function _registerScannerNode(ScannerNodeRegistration calldata req) internal {
        if (isScannerRegistered(req.scanner)) revert ScannerExists(req.scanner);
        if (_scannerPoolChainId[req.scannerPoolId] != req.chainId)
            revert ChainIdMismatch(_scannerPoolChainId[req.scannerPoolId], req.chainId);
        _scannerNodes[req.scanner] = ScannerNode({ registered: true, disabled: false, scannerPoolId: req.scannerPoolId, chainId: req.chainId, metadata: req.metadata });
        // It is safe to ignore add()'s returned bool, since isScannerRegistered() already checks for duplicates.
        !_scannerNodeOwnership[req.scannerPoolId].add(req.scanner);
        emit ScannerUpdated(scannerAddressToId(req.scanner), req.chainId, req.metadata, req.scannerPoolId);
        _addEnabledScanner(req.scannerPoolId);
    }

    /**
     * @notice Method to update a registered Scanner Node metadata string. Only the ScannerPool that owns the scanner can update.
     * @param scanner address.
     * @param metadata IPFS string pointing to Scanner Node metadata.
     */
    function updateScannerMetadata(address scanner, string calldata metadata) external {
        if (!isScannerRegistered(scanner)) revert ScannerNotRegistered(scanner);
        // Not using onlyScannerPool(_scannerNodes[scanner].scannerPoolId) to improve error readability.
        // If the scanner is not registered, onlyOwner would be first and emit "ERC721: invalid token ID", which is too cryptic.
        if (_msgSender() != ownerOf(_scannerNodes[scanner].scannerPoolId)) {
            revert SenderNotScannerPool(_msgSender(), _scannerNodes[scanner].scannerPoolId);
        }
        _scannerNodes[scanner].metadata = metadata;
        emit ScannerUpdated(scannerAddressToId(scanner), _scannerNodes[scanner].chainId, metadata, _scannerNodes[scanner].scannerPoolId);
    }

    /**
     * @notice gets the amount of Scanner Nodes ever registered to a ScannerPool Id.
     * Useful for external iteration.
     * @param scannerPoolId ERC721 token id of the ScannerPool.
     */
    function totalScannersRegistered(uint256 scannerPoolId) public view returns (uint256) {
        return _scannerNodeOwnership[scannerPoolId].length();
    }

    /**
     * @notice gets the Scanner Node address at index registered to scannerPoolId
     * Useful for external iteration.
     * @param scannerPoolId ERC721 token id of the ScannerPool.
     * @param index of the registered Scanner Node. Must be lower than totalScannersRegistered(scannerPoolId)
     */
    function registeredScannerAtIndex(uint256 scannerPoolId, uint256 index) external view returns (ScannerNode memory) {
        return _scannerNodes[_scannerNodeOwnership[scannerPoolId].at(index)];
    }

    /**
     * @notice gets the Scanner Node data struct at index registered to scannerPoolId
     * Useful for external iteration.
     * @param scannerPoolId ERC721 token id of the ScannerPool.
     * @param index of the registered Scanner Node. Must be lower than totalScannersRegistered(scannerPoolId)
     */
    function registeredScannerAddressAtIndex(uint256 scannerPoolId, uint256 index) external view returns (address) {
        return _scannerNodeOwnership[scannerPoolId].at(index);
    }

    // ************* Converters *************

    /// Converts scanner address to uint256 for FortaStaking Token Id.
    function scannerAddressToId(address scanner) public pure returns (uint256) {
        return uint256(uint160(scanner));
    }

    /// Converts FortaStaking uint256 id to address.
    function scannerIdToAddress(uint256 scannerId) public pure returns (address) {
        return address(uint160(scannerId));
    }

    // ************* Scanner Disabling *************

    /// Gets if the disabled flag has been set for a Scanner Node Address
    function isScannerDisabled(address scanner) public view returns (bool) {
        return _scannerNodes[scanner].disabled;
    }

    /**
     * @notice Checks if the Scanner Node is considered operational by the Forta Network, and is thus eligible for bot (Agent) assignment.
     * @param scanner address
     * @return true if:
     * - Scanner Node is registered AND
     * - Scanner Node's disabled flag is not set (is false) AND
     * - (Scanner Node has more than minimum stake allocated to it OR staking is not activated for the Scanner Node's chain)
     */
    function isScannerOperational(address scanner) public view returns (bool) {
        ScannerNode storage node = _scannerNodes[scanner];
        StakeThreshold storage stake = _scannerStakeThresholds[node.chainId];
        return (node.registered && !node.disabled && (!stake.activated || _isScannerStakedOverMin(scanner)) && _exists(node.scannerPoolId));
    }

    /// returns true if one more enabled scanner (or one registration) would put ALL scanners under min threshold, (not operational)
    function willNewScannerShutdownPool(uint256 scannerPoolId) public view returns (bool) {
        uint256 unallocatedStake = _stakeAllocator.unallocatedStakeFor(SCANNER_POOL_SUBJECT, scannerPoolId);
        uint256 allocatedStake = _stakeAllocator.allocatedStakeFor(SCANNER_POOL_SUBJECT, scannerPoolId);
        uint256 min = _scannerStakeThresholds[_scannerPoolChainId[scannerPoolId]].min;
        return (allocatedStake + unallocatedStake) / (_enabledScanners[scannerPoolId] + 1) < min;
    }

    /// Returns true if the owner of NodeRegistry (DELEGATED) has staked over min for scanner, false otherwise.
    function _isScannerStakedOverMin(address scanner) internal view returns (bool) {
        ScannerNode storage node = _scannerNodes[scanner];
        StakeThreshold storage stake = _scannerStakeThresholds[node.chainId];
        return _stakeAllocator.allocatedStakePerManaged(SCANNER_POOL_SUBJECT, node.scannerPoolId) >= stake.min;
    }

    /**
     * @notice Checks if sender or meta-tx sender is allowed to set disabled flag for a Scanner Node
     * @param scanner address
     * @return true if _msgSender() is the ScannerPool owning the Scanner or the Scanner Node itself
     */
    function _canSetEnableState(address scanner) internal view virtual returns (bool) {
        return _msgSender() == scanner || ownerOf(_scannerNodes[scanner].scannerPoolId) == _msgSender();
    }

    /**
     * @notice Sets Scanner Node disabled flag to false.
     * It's not possible to re-enable a Scanner Node if allocatedStake / enabled scanners < min.
     * If there is enough unallocated stake, this method will allocate it. If not, it will revert.
     * @param scanner address
     */
    function enableScanner(address scanner) public onlyRegisteredScanner(scanner) {
        if (!_canSetEnableState(scanner)) revert CannotSetScannerActivation();
        if (!isScannerDisabled(scanner)) revert ScannerPreviouslyEnabled(scanner);
        _addEnabledScanner(_scannerNodes[scanner].scannerPoolId);
        _allocationOnAddedEnabledScanner(_scannerNodes[scanner].scannerPoolId);
        _setScannerDisableFlag(scanner, false);
    }

    /**
     * @notice Sets Scanner Node disabled flag to true. This will result in the scanner unlinking from assigned bots (process happens off-chain
     * in Assigner software) and not being able to be linked to any bot until re-enabled.
     * @param scanner address
     */
    function disableScanner(address scanner) public onlyRegisteredScanner(scanner) {
        if (!_canSetEnableState(scanner)) revert CannotSetScannerActivation();
        if (isScannerDisabled(scanner)) revert ScannerPreviouslyDisabled(scanner);
        _removeEnabledScanner(_scannerNodes[scanner].scannerPoolId);
        _unallocationOnDisabledScanner(_scannerNodes[scanner].scannerPoolId);
        _setScannerDisableFlag(scanner, true);
    }

    function _setScannerDisableFlag(address scanner, bool value) internal {
        _scannerNodes[scanner].disabled = value;
        emit ScannerEnabled(scannerAddressToId(scanner), isScannerOperational(scanner), _msgSender(), value);
    }

    function _addEnabledScanner(uint256 scannerPoolId) private {
        _enabledScanners[scannerPoolId] += 1;
        emit EnabledScannersChanged(scannerPoolId, _enabledScanners[scannerPoolId]);
    }

    function _removeEnabledScanner(uint256 scannerPoolId) private {
        _enabledScanners[scannerPoolId] -= 1;
        emit EnabledScannersChanged(scannerPoolId, _enabledScanners[scannerPoolId]);
    }

    /**
     * @notice Updates enabled scanner count of a pool
     * @param scannerPoolId ERC721 token id of the ScannerPool
     */
    function updateEnabledScanners(uint256 scannerPoolId, uint256 count) external onlyRole(SCANNER_POOL_ADMIN_ROLE) {
        _enabledScanners[scannerPoolId] = count;
        emit EnabledScannersChanged(scannerPoolId, _enabledScanners[scannerPoolId]);
    }

    // ************* Scanner Getters *************

    /// Gets ScannerNode struct for address
    function getScanner(address scanner) public view returns (ScannerNode memory) {
        return _scannerNodes[scanner];
    }

    /// Gets ScannerNode data for address
    function getScannerState(address scanner)
        external
        view
        returns (
            bool registered,
            address owner,
            uint256 chainId,
            string memory metadata,
            bool operational,
            bool disabled
        )
    {
        ScannerNode memory scannerNode = getScanner(scanner);
        return (
            scannerNode.registered,
            scannerNode.registered ? ownerOf(scannerNode.scannerPoolId) : address(0),
            scannerNode.chainId,
            scannerNode.metadata,
            isScannerOperational(scanner),
            scannerNode.disabled
        );
    }

    // ************* DelegatedStakeSubjectUpgradeable *************

    /**
     * @notice Sets stake parameters (min, max, activated) for scanners. Restricted to SCANNER_POOL_ADMIN_ROLE
     * @param newStakeThreshold struct with stake parameters.
     * @param chainId scanned chain the thresholds applies to.
     */
    function setManagedStakeThreshold(StakeThreshold calldata newStakeThreshold, uint256 chainId) external onlyRole(SCANNER_POOL_ADMIN_ROLE) {
        if (chainId == 0) revert ZeroAmount("chainId");
        if (newStakeThreshold.max <= newStakeThreshold.min) revert StakeThresholdMaxLessOrEqualMin();
        emit ManagedStakeThresholdChanged(chainId, newStakeThreshold.min, newStakeThreshold.max, newStakeThreshold.activated);
        _scannerStakeThresholds[chainId] = newStakeThreshold;
    }

    /**
     * @notice Getter for StakeThreshold for the scanner with id `subject`
     */
    function getManagedStakeThreshold(uint256 managedId) public view returns (StakeThreshold memory) {
        return _scannerStakeThresholds[_scannerPoolChainId[managedId]];
    }

    /// Total scanners registered to a ScannerPool
    function getTotalManagedSubjects(uint256 subject) public view virtual override returns (uint256) {
        return _enabledScanners[subject];
    }

    // ************* Privilege setters ***************

    /// Sets maximum delay between execution of forta auth in Scan Node CLI and execution of registerScanner() in this contract
    function setRegistrationDelay(uint256 delay) external onlyRole(SCANNER_POOL_ADMIN_ROLE) {
        _setRegistrationDelay(delay);
    }

    function _setRegistrationDelay(uint256 delay) internal {
        if (delay == 0) revert ZeroAmount("delay");
        registrationDelay = delay;
        emit RegistrationDelaySet(delay);
    }

    // ************* Inheritance Overrides *************

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override(ERC721Upgradeable, ERC721EnumerableUpgradeable) {
        super._beforeTokenTransfer(from, to, tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721Upgradeable, ERC721EnumerableUpgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
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
    function ownerOf(uint256 subject) public view virtual override(IStakeSubject, ERC721Upgradeable) returns (address) {
        return super.ownerOf(subject);
    }

    /**
     *  50
     * - 5 DelegatedStakeSubjectUpgradeable (to match with older registries)
     * - 1 _scannerPoolIdCounter;
     * - 1 _scannerNodes;
     * - 1 _scannerNodeOwnership
     * - 1 _enabledScanners
     * - 1 _scannerStakeThresholds
     * - 1 _scannerPoolChainId
     * - 1 registrationDelay
     * --------------------------
     *  38 __gap
     */
    uint256[38] private __gap;
}
