// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../BaseComponentUpgradeable.sol";
import "../staking/StakeSubject.sol";
import "../../errors/GeneralErrors.sol";

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/SignatureCheckerUpgradeable.sol";

abstract contract NodeRunnerRegistryCore is BaseComponentUpgradeable, ERC721Upgradeable, ERC721EnumerableUpgradeable, StakeSubjectUpgradeable, EIP712Upgradeable {
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
    mapping(uint256 => EnumerableSet.AddressSet) internal _scannerNodeOwnership;
    /// StakeThreshold of each chainId;
    mapping(uint256 => StakeThreshold) internal _stakeThresholds;
    /// Maximum amount of time allowed from scanner signing a ScannerNodeRegistration and its execution by NodeRunner
    uint256 public registrationDelay;

    event ScannerUpdated(uint256 indexed scannerId, uint256 indexed chainId, string metadata, uint256 nodeRunner);
    event StakeThresholdChanged(uint256 indexed chainId, uint256 min, uint256 max, bool activated);
    event RegistrationDelaySet(uint256 delay);
    // TODO: discuss with the dev team if it breaks compatibility to change 'enabled' too 'operational'
    event ScannerEnabled(uint256 indexed scannerId, bool indexed enabled, address sender, bool disableFlag);

    error NodeRunnerNotRegistered(uint256 nodeRunnerId);
    error ScannerExists(address scanner);
    error ScannerNotRegistered(address scanner);
    error PublicRegistrationDisabled(uint256 chainId);
    error RegisteringTooLate();
    error SignatureDoesNotMatch();
    error CannotSetScannerActivation();
    error SenderNotNodeRunner(address sender, uint256 nodeRunnerId);

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
    function registerNodeRunner() external returns (uint256 nodeRunnerId) {
        return _registerNodeRunner(_msgSender());
    }

    function _registerNodeRunner(address nodeRunnerAddress) internal returns(uint256 nodeRunnerId) {
        if (nodeRunnerAddress == address(0)) revert ZeroAddress("nodeRunnerAddress");
        _nodeRunnerIdCounter.increment();
        nodeRunnerId = _nodeRunnerIdCounter.current();
        _safeMint(nodeRunnerAddress, nodeRunnerId);
        return nodeRunnerId;
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
                            keccak256(
                                abi.encodePacked(req.metadata)
                            ),
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
    function totalScannersRegistered(uint256 nodeRunnerId) external view returns (uint256) {
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
    function isDisabled(address scanner) public view returns (bool) {
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
    function isOperational(address scanner) public view returns (bool) {
        // _isStakedOverMin already checks for disabled, but returns true in every case if stakeController is not set.
        // since isStakedOverMin() is external, we need to keep this duplicate check.
        return !_scannerNodes[scanner].disabled &&
            !_scannerNodes[scanner].disabled &&
            _isStakedOverMin(scannerAddressToId(scanner));
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
        uint256 scannerId = scannerAddressToId(scanner);
        if (!_isStakedOverMin(scannerId)) revert StakedUnderMinimum(scannerId);
        _setScannerDisableFlag(scanner, false);
    }

    /**
     * @notice Sets Scanner Node disabled flag to true. This will result in the scanner unlinking from assigned bots (process happens off-chain
     * in Assigner software) and not being able to be linked to any bot until re-enabled.
     * @param scanner address
     */
    function disableScanner(address scanner) public onlyRegisteredScanner(scanner) {
        if (!_canSetEnableState(scanner)) revert CannotSetScannerActivation();
        _setScannerDisableFlag(scanner, true);
    }

    function _setScannerDisableFlag(address scanner, bool value) private {
        _scannerNodes[scanner].disabled = value;
        emit ScannerEnabled(scannerAddressToId(scanner), isOperational(scanner), _msgSender(), value);
    }

    // ************* Scanner Getters *************

    /// Gets ScannerNode struct for address
    function getScanner(address scanner) public view returns (ScannerNode memory) {
        return _scannerNodes[scanner];
    }

    /// Gets ScannerNode data for address (compatibility method for off-chain components)
    function getScannerState(uint256 scannerId)
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
        ScannerNode memory scanner = getScanner(scannerIdToAddress(scannerId));
        return (
            scanner.registered,
            scanner.registered ? ownerOf(scanner.nodeRunnerId) : address(0),
            scanner.chainId,
            scanner.metadata,
            isOperational(scannerIdToAddress(scannerId)),
            scanner.disabled);
    }

    // ************* Stake Threshold *************

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
     * @notice Getter for StakeThreshold for the scanner with id `subject`
     */
    function getStakeThreshold(uint256 subject) public view returns (StakeThreshold memory) {
        return _stakeThresholds[_scannerNodes[scannerIdToAddress(subject)].chainId];
    }

    /**
     * Checks if scanner is staked over minimum stake
     * @param scannerId scanner
     * @return true if scanner is staked over the minimum threshold for that chainId and is registered,
     * or staking is not yet enabled (stakeController = 0).
     * false otherwise
     */
    function _isStakedOverMin(uint256 scannerId) internal view virtual override returns (bool) {
        if (address(getStakeController()) == address(0)) {
            return true;
        }
        return
            getStakeController().activeStakeFor(SCANNER_SUBJECT, scannerId) >=
            getStakeThreshold(scannerId).min &&
            isScannerRegistered(scannerIdToAddress(scannerId));
    }

    // ************* Priviledge setters ***************

    /// Sets maximum delay between execution of forta auth in Scan Node CLI and execution of registerScanner() in this contract
    function setRegistrationDelay(uint256 delay) external onlyRole(SCANNER_ADMIN_ROLE) {
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

    uint256[45] private __gap;
}
