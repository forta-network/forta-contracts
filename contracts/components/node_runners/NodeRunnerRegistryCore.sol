// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../BaseComponentUpgradeable.sol";
import "../staking/StakeSubject.sol";
import "../staking/IDelegatedStakeSubject.sol";
import "../../errors/GeneralErrors.sol";

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/SignatureCheckerUpgradeable.sol";

abstract contract NodeRunnerRegistryCore is
    BaseComponentUpgradeable,
    ERC721Upgradeable,
    ERC721EnumerableUpgradeable,
    StakeSubjectUpgradeable,
    IDelegatedStakeSubject,
    EIP712Upgradeable
{
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using EnumerableSet for EnumerableSet.AddressSet;

    struct ScannerNode {
        bool registered;
        bool disabled;
        uint256 nodeRunnerId;
        uint256 chainId;
        string metadata;
    }
    struct ScannerNodeRegistration {
        address scanner;
        uint256 nodeRunnerId;
        uint256 chainId;
        string metadata;
        uint256 timestamp;
    }

    bytes32 private constant _SCANNERNODEREGISTRATION_TYPEHASH =
        keccak256("ScannerNodeRegistration(address scanner,uint256 nodeRunnerId,uint256 chainId,string metadata,uint256 timestamp)");

    /// nodeRunnerIds is a sequential autoincremented uint
    CountersUpgradeable.Counter private _nodeRunnerIdCounter;
    /// ScannerNode data for each scanner address;
    mapping(address => ScannerNode) internal _scannerNodes;
    /// Set of Scanner Node addresses each nodeRunnerId owns;
    mapping(uint256 => EnumerableSet.AddressSet) private _scannerNodeOwnership;
    /// Count of enabled scanners per nodeRunnerId (nodeRunnerId => total Enabled Scanners)
    mapping(uint256 => uint256) private _enabledScanners;
    /// StakeThreshold of node runners
    StakeThreshold private _stakeThreshold; // 3 storage slots
    mapping(uint256 => StakeThreshold) private _scannerStakeThresholds;
    /// nodeRunnerId => chainId. Limitation necessary to calculate stake allocations.
    mapping(uint256 => uint256) private _nodeRunnerChainId;
    /// Maximum amount of time allowed from scanner signing a ScannerNodeRegistration and its execution by NodeRunner
    uint256 public registrationDelay;

    event ScannerUpdated(uint256 indexed scannerId, uint256 indexed chainId, string metadata, uint256 nodeRunner);
    event StakeThresholdChanged(uint256 min, uint256 max, bool activated);
    event ManagedStakeThresholdChanged(uint256 indexed chainId, uint256 min, uint256 max, bool activated);
    event RegistrationDelaySet(uint256 delay);
    // TODO: discuss with the dev team if it breaks compatibility to change 'enabled' too 'operational'
    event ScannerEnabled(uint256 indexed scannerId, bool indexed enabled, address sender, bool disableFlag);
    event EnabledScannersChanged(uint256 indexed nodeRunnerId, uint256 enabledScanners);
    event NodeRunnerRegistered(uint256 indexed nodeRunnerId, uint256 indexed chainId);

    error NodeRunnerNotRegistered(uint256 nodeRunnerId);
    error ScannerExists(address scanner);
    error ScannerNotRegistered(address scanner);
    error PublicRegistrationDisabled(uint256 chainId);
    error RegisteringTooLate();
    error SignatureDoesNotMatch();
    error CannotSetScannerActivation();
    error SenderNotNodeRunner(address sender, uint256 nodeRunnerId);
    error ChainIdMismatch(uint256 expected, uint256 provided);

    /**
     * @notice Checks sender (or metatx signer) is owner of the NodeRunnerRegistry ERC721 with ID nodeRunnerId.
     * @param nodeRunnerId ERC721 token id of the Node Runner.
     */
    modifier onlyNodeRunner(uint256 nodeRunnerId) {
        if (_msgSender() != ownerOf(nodeRunnerId)) revert SenderNotNodeRunner(_msgSender(), nodeRunnerId);
        _;
    }

    modifier onlyRegisteredScanner(address scanner) {
        if (!isScannerRegistered(scanner)) revert ScannerNotRegistered(scanner);
        _;
    }

    /**
     * @notice Initializer method
     * @param __name ERC721 token name.
     * @param __symbol ERC721 token symbol.
     * @param __stakeSubjectManager address of StakeSubjectManager
     * @param __registrationDelay amount of time allowed from scanner signing a ScannerNodeRegistration and it's execution by NodeRunner
     */
    function __NodeRunnerRegistryCore_init(
        string calldata __name,
        string calldata __symbol,
        address __stakeSubjectManager,
        uint256 __registrationDelay
    ) internal initializer {
        __ERC721_init(__name, __symbol);
        __ERC721Enumerable_init();
        __EIP712_init("NodeRunnerRegistry", "1");
        __StakeSubjectUpgradeable_init(__stakeSubjectManager);

        _setRegistrationDelay(__registrationDelay);
    }

    // ************* Node Runner Ownership *************

    /**
     * @notice Checks if nodeRunnerId has been registered (minted).
     * @param nodeRunnerId ERC721 token id of the Node Runner.
     * @return true if nodeRunnerId exists, false otherwise.
     */
    function isRegistered(uint256 nodeRunnerId) public view override returns (bool) {
        return _exists(nodeRunnerId);
    }

    /**
     * @notice mints a NodeRunnerRegistry ERC721 NFT to sender
     * Transferring ownership of a NodeRunnerRegistry NFT will transfer ownership of all its registered
     * Scanner Node addresses
     * @return nodeRunnerId (autoincremented uint)
     */
    function registerNodeRunner(uint256 chainId) external returns (uint256 nodeRunnerId) {
        return _registerNodeRunner(_msgSender(), chainId);
    }

    function _registerNodeRunner(address nodeRunnerAddress, uint256 chainId) internal returns (uint256 nodeRunnerId) {
        if (nodeRunnerAddress == address(0)) revert ZeroAddress("nodeRunnerAddress");
        if (chainId == 0) revert ZeroAmount("chainId");
        _nodeRunnerIdCounter.increment();
        nodeRunnerId = _nodeRunnerIdCounter.current();
        _safeMint(nodeRunnerAddress, nodeRunnerId);
        _nodeRunnerChainId[nodeRunnerId] = chainId;
        emit NodeRunnerRegistered(nodeRunnerId, chainId);
        return nodeRunnerId;
    }

    /**
     * @notice checks if a node runner is operational in the network.
     * @param nodeRunnerId ERC721 id for a Node Runner.
     * returns true if id exists and is staked over minimum, false otherwise.
     */
    function isNodeRunnerOperational(uint256 nodeRunnerId) public view returns (bool) {
        // _isStakedOverMin already checks for disabled, but returns true in every case if stakeController is not set.
        // since isStakedOverMin() is external, we need to keep this duplicate check.
        return _exists(nodeRunnerId) && _isStakedOverMin(nodeRunnerId);
    }

    function monitoredChainId(uint256 nodeRunnerId) public view returns (uint256) {
        return _nodeRunnerChainId[nodeRunnerId];
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
     * @notice Checks if scanner address has been registered to a specific nodeRunnerId
     * @param scanner address.
     * @param nodeRunnerId ERC721 token id of the Node Runner.
     * @return true if scanner is registered to nodeRunnerId, false otherwise.
     */
    function isScannerRegisteredTo(address scanner, uint256 nodeRunnerId) public view returns (bool) {
        return _scannerNodeOwnership[nodeRunnerId].contains(scanner);
    }

    /**
     * @notice Method to register a Scanner Node and associate it with a nodeRunnerId. Before executing this method,
     * register a scanner with Forta Scan Node CLI and obtain the parameters for this methods by executing forta auth.
     * Follow the instructions here https://docs.forta.network/en/latest/scanner-quickstart/
     * Individual ownership of a scaner node is not transferrable.
     * A scanner node can be disabled, but not unregistered
     * @param req ScannerNodeRegistration struct with the Scanner Node data.
     * @param signature ERC712 signature, result from signed req by the scanner.
     */
    function registerScannerNode(ScannerNodeRegistration calldata req, bytes calldata signature) external onlyNodeRunner(req.nodeRunnerId) {
        if (req.timestamp + registrationDelay < block.timestamp) revert RegisteringTooLate();
        if (
            !SignatureCheckerUpgradeable.isValidSignatureNow(
                req.scanner,
                _hashTypedDataV4(
                    keccak256(
                        abi.encode(
                            _SCANNERNODEREGISTRATION_TYPEHASH,
                            req.scanner,
                            req.nodeRunnerId,
                            req.chainId,
                            keccak256(abi.encodePacked(req.metadata)),
                            req.timestamp
                        )
                    )
                ),
                signature
            )
        ) revert SignatureDoesNotMatch();
        _registerScannerNode(req);
    }

    function _registerScannerNode(ScannerNodeRegistration calldata req) internal {
        if (isScannerRegistered(req.scanner)) revert ScannerExists(req.scanner);
        if (_nodeRunnerChainId[req.nodeRunnerId] != req.chainId) revert ChainIdMismatch(_nodeRunnerChainId[req.nodeRunnerId], req.chainId);
        _scannerNodes[req.scanner] = ScannerNode({
            registered: true,
            disabled: false,
            nodeRunnerId: req.nodeRunnerId,
            chainId: req.chainId,
            metadata: req.metadata
        });
        // It is safe to ignore add()'s returned bool, since isScannerRegistered() already checks for duplicates.
        !_scannerNodeOwnership[req.nodeRunnerId].add(req.scanner);
        emit ScannerUpdated(scannerAddressToId(req.scanner), req.chainId, req.metadata, req.nodeRunnerId);
        _addEnabledScanner(req.nodeRunnerId);
    }

    /**
     * @notice Method to update a registered Scanner Node metadata string. Only the Node Runner that owns the scanner can update.
     * @param scanner address.
     * @param metadata IPFS string pointing to Scanner Node metadata.
     */
    function updateScannerMetadata(address scanner, string calldata metadata) external {
        if (!isScannerRegistered(scanner)) revert ScannerNotRegistered(scanner);
        // Not using onlyNodeRunner(_scannerNodes[scanner].nodeRunnerId) to improve error readability.
        // If the scanner is not registered, onlyOwner would be first and emit "ERC721: invalid token ID", which is too cryptic.
        if (_msgSender() != ownerOf(_scannerNodes[scanner].nodeRunnerId)) {
            revert SenderNotNodeRunner(_msgSender(), _scannerNodes[scanner].nodeRunnerId);
        }
        _scannerNodes[scanner].metadata = metadata;
        emit ScannerUpdated(scannerAddressToId(scanner), _scannerNodes[scanner].chainId, metadata, _scannerNodes[scanner].nodeRunnerId);
    }

    /**
     * @notice gets the amount of Scanner Nodes ever registered to a Node Runner Id.
     * Useful for external iteration.
     * @param nodeRunnerId ERC721 token id of the Node Runner.
     */
    function totalScannersRegistered(uint256 nodeRunnerId) public view returns (uint256) {
        return _scannerNodeOwnership[nodeRunnerId].length();
    }

    /**
     * @notice gets the Scanner Node address at index registered to nodeRunnerId
     * Useful for external iteration.
     * @param nodeRunnerId ERC721 token id of the Node Runner.
     * @param index of the registered Scanner Node. Must be lower than totalScannersRegistered(nodeRunnerId)
     */
    function registeredScannerAtIndex(uint256 nodeRunnerId, uint256 index) external view returns (ScannerNode memory) {
        return _scannerNodes[_scannerNodeOwnership[nodeRunnerId].at(index)];
    }

    /**
     * @notice gets the Scanner Node data struct at index registered to nodeRunnerId
     * Useful for external iteration.
     * @param nodeRunnerId ERC721 token id of the Node Runner.
     * @param index of the registered Scanner Node. Must be lower than totalScannersRegistered(nodeRunnerId)
     */
    function registeredScannerAddressAtIndex(uint256 nodeRunnerId, uint256 index) external view returns (address) {
        return _scannerNodeOwnership[nodeRunnerId].at(index);
    }

    // ************* Converters *************

    /// Converts scanner address to uint256 for FortaStaking Token Id.
    function scannerAddressToId(address scanner) public pure returns (uint256) {
        return uint256(uint160(scanner));
    }

    /// Converts scanner address to uint256 for FortaStaking Token Id.
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
        // _isStakedOverMin already checks for disabled, but returns true in every case if stakeController is not set.
        // since isStakedOverMin() is external, we need to keep this duplicate check.
        return
            _isStakedOverMin(_scannerNodes[scanner].nodeRunnerId) &&
            _scannerNodes[scanner].registered &&
            !_scannerNodes[scanner].disabled &&
            _isScannerStakedOverMin(scanner);
    }

    function _isScannerStakedOverMin(address scanner) internal view returns (bool) {
        if (!_scannerStakeThresholds[_scannerNodes[scanner].chainId].activated) {
            return true;
        }
        return allocatedStakePerScanner(_scannerNodes[scanner].nodeRunnerId) >= _scannerStakeThresholds[_scannerNodes[scanner].chainId].min;
    }

    /**
     * @notice Checks if sender or meta-tx sender is allowed to set disabled flag for a Scanner Node
     * @param scanner address
     * @return true if _msgSender() is the NodeRunner owning the Scanner or the Scanner Node itself
     */
    function _canSetEnableState(address scanner) internal view virtual returns (bool) {
        return _msgSender() == scanner || ownerOf(_scannerNodes[scanner].nodeRunnerId) == _msgSender();
    }

    /**
     * @notice Sets Scanner Node disabled flag to false. It's not possible to re-enable a Scanner Node
     * if the active stake allocated to it is below minimum for the scanned chainId.
     * If that happens, allocate more stake to it, then try enableScanner again.
     * @param scanner address
     */
    function enableScanner(address scanner) public onlyRegisteredScanner(scanner) {
        if (!_canSetEnableState(scanner)) revert CannotSetScannerActivation();
        _setScannerDisableFlag(scanner, false);
        _addEnabledScanner(_scannerNodes[scanner].nodeRunnerId);
    }

    /**
     * @notice Sets Scanner Node disabled flag to true. This will result in the scanner unlinking from assigned bots (process happens off-chain
     * in Assigner software) and not being able to be linked to any bot until re-enabled.
     * @param scanner address
     */
    function disableScanner(address scanner) public onlyRegisteredScanner(scanner) {
        if (!_canSetEnableState(scanner)) revert CannotSetScannerActivation();
        _setScannerDisableFlag(scanner, true);
        _removeEnabledScanner(_scannerNodes[scanner].nodeRunnerId);
    }

    function _setScannerDisableFlag(address scanner, bool value) private {
        _scannerNodes[scanner].disabled = value;
        emit ScannerEnabled(scannerAddressToId(scanner), isScannerOperational(scanner), _msgSender(), value);
    }

    function _addEnabledScanner(uint256 nodeRunnerId) private {
        _enabledScanners[nodeRunnerId] += 1;
        emit EnabledScannersChanged(nodeRunnerId, _enabledScanners[nodeRunnerId]);
    }

    function _removeEnabledScanner(uint256 nodeRunnerId) private {
        _enabledScanners[nodeRunnerId] -= 1;
        emit EnabledScannersChanged(nodeRunnerId, _enabledScanners[nodeRunnerId]);
    }

    // ************* Scanner Getters *************

    /// Gets ScannerNode struct for address
    function getScanner(address scanner) public view returns (ScannerNode memory) {
        return _scannerNodes[scanner];
    }

    /// Gets ScannerNode data for address (compatibility method for off-chain components)
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
            scannerNode.registered ? ownerOf(scannerNode.nodeRunnerId) : address(0),
            scannerNode.chainId,
            scannerNode.metadata,
            isScannerOperational(scanner),
            scannerNode.disabled
        );
    }

    // ************* StakeSubjectUpgradeable *************

    /**
     * @notice Sets stake parameters (min, max, activated) for node runners. Restricted to NODE_RUNNER_ADMIN_ROLE
     * @param newStakeThreshold struct with stake parameters.
     */
    function setStakeThreshold(StakeThreshold calldata newStakeThreshold) external onlyRole(NODE_RUNNER_ADMIN_ROLE) {
        if (newStakeThreshold.max <= newStakeThreshold.min) revert StakeThresholdMaxLessOrEqualMin();
        emit StakeThresholdChanged(newStakeThreshold.min, newStakeThreshold.max, newStakeThreshold.activated);
        _stakeThreshold = newStakeThreshold;
    }

    /**
     * @notice Getter for StakeThreshold for the scanner with id `subject`
     */
    function getStakeThreshold(uint256 subject) public view returns (StakeThreshold memory) {
        return _stakeThreshold;
    }

    /**
     * Checks if nodeRunner is staked over minimum stake
     * @param nodeRunnerId nodeRunner
     * @return true if nodeRunner is staked over the minimum threshold,
     * or staking is not enabled (stakeController = address(0) or activated=false).
     * false otherwise
     */
    function _isStakedOverMin(uint256 nodeRunnerId) internal view virtual override returns (bool) {
        if (address(getSubjectHandler()) == address(0) || ! _stakeThreshold.activated) {
            return true;
        }
        return (getSubjectHandler().activeStakeFor(NODE_RUNNER_SUBJECT, nodeRunnerId) >= _stakeThreshold.min && _exists(nodeRunnerId));
    }

    // ************* IDelegatedStakeSubject *************

    /**
     * @notice Sets stake parameters (min, max, activated) for scanners. Restricted to NODE_RUNNER_ADMIN_ROLE
     * @param newStakeThreshold struct with stake parameters.
     * @param chainId scanned chain the thresholds applies to.
     */
    function setManagedStakeThreshold(StakeThreshold calldata newStakeThreshold, uint256 chainId) external onlyRole(NODE_RUNNER_ADMIN_ROLE) {
        if (chainId == 0) revert ZeroAmount("chainId");
        if (newStakeThreshold.max <= newStakeThreshold.min) revert StakeThresholdMaxLessOrEqualMin();
        emit ManagedStakeThresholdChanged(chainId, newStakeThreshold.min, newStakeThreshold.max, newStakeThreshold.activated);
        _scannerStakeThresholds[chainId] = newStakeThreshold;
    }

    /**
     * @notice Getter for StakeThreshold for the scanner with id `subject`
     */
    function getManagedStakeThreshold(uint256 managedId) public view returns (StakeThreshold memory) {
        return _scannerStakeThresholds[managedId];
    }

    /// Total scanners registered to a Node Runner
    function getTotalManagedSubjects(uint256 subject) public view virtual override returns (uint256) {
        return _enabledScanners[subject];
    }

    /// Amount of FORT allocated to each *enabled* scanner
    function allocatedStakePerScanner(uint256 nodeRunnerId) public view returns (uint256) {
        return getSubjectHandler().allocatedStakeFor(NODE_RUNNER_SUBJECT, nodeRunnerId) / getTotalManagedSubjects(nodeRunnerId);
    }

    /// Amount of FORT allocated in a scanner. Returns 0 if disabled.
    function allocatedStakeOfScanner(address scanner) public view returns (uint256) {
        if (_scannerNodes[scanner].disabled) {
            return 0;
        }
        return allocatedStakePerScanner(_scannerNodes[scanner].nodeRunnerId);
    }

    // ************* Priviledge setters ***************

    /// Sets maximum delay between execution of forta auth in Scan Node CLI and execution of registerScanner() in this contract
    function setRegistrationDelay(uint256 delay) external onlyRole(NODE_RUNNER_ADMIN_ROLE) {
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
    function ownerOf(uint256 subject) public view virtual override(IStakeSubject, StakeSubjectUpgradeable, ERC721Upgradeable) returns (address) {
        return super.ownerOf(subject);
    }

    uint256[41] private __gap;
}
