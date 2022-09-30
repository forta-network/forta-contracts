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

import "hardhat/console.sol";

abstract contract NodeRunnerRegistryCore is BaseComponentUpgradeable, ERC721Upgradeable, ERC721EnumerableUpgradeable, StakeSubjectUpgradeable, EIP712Upgradeable {
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using EnumerableSet for EnumerableSet.AddressSet;

    struct ScannerNode {
        bool registered;
        bool disabled;
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

    CountersUpgradeable.Counter private _nodeRunnerIdCounter;
    mapping(address => ScannerNode) _scannerNodes;
    mapping(uint256 => EnumerableSet.AddressSet) internal _scannerNodeOwnership;
    mapping(uint256 => StakeThreshold) internal _stakeThresholds;
    uint256 public registrationDelay;

    event ScannerUpdated(uint256 indexed scannerId, uint256 indexed chainId, string metadata, uint256 nodeRunner);
    event StakeThresholdChanged(uint256 indexed chainId, uint256 min, uint256 max, bool activated);
    event RegistrationDelaySet(uint256 delay);
    event ScannerEnabled(uint256 indexed scannerId, bool indexed enabled, address sender, bool value);

    error NodeRunnerNotRegistered(uint256 nodeRunnerId);
    error ScannerExists(address scanner);
    error ScannerNotRegistered(address scanner);
    error ScannerAlreadyRegisteredTo(address scanner, uint256 nodeRunnerId);
    error ScannerNotRegisteredTo(address scanner, uint256 nodeRunnerId);
    error PublicRegistrationDisabled(uint256 chainId);
    error RegisteringTooLate();
    error SignatureDoesNotMatch();
    error CannotSetScannerActivation();

    /**
     * @notice Checks sender (or metatx signer) is owner of the scanner token.
     * @param nodeRunnerId ERC721 token id of the scanner.
     */
    modifier onlyOwnerOf(uint256 nodeRunnerId) {
        if (_msgSender() != ownerOf(nodeRunnerId)) revert SenderNotOwner(_msgSender(), nodeRunnerId);
        _;
    }

    modifier onlyScannerRegisteredTo(address scanner, uint256 nodeRunnerId) {
        if (!isScannerRegisteredTo(scanner, nodeRunnerId)) revert ScannerNotRegisteredTo(scanner, nodeRunnerId);
        _;
    }

    // ************* Node Runner Ownership *************

    /**
     * @notice Checks if nodeRunnerId has been registered (minted).
     * @param nodeRunnerId ERC721 token id of the scanner.
     * @return true if nodeRunnerId exists, false otherwise.
     */
    function isRegistered(uint256 nodeRunnerId) public view override returns (bool) {
        return _exists(nodeRunnerId);
    }

    function registerNodeRunner() external returns (uint256 nodeRunnerId) {
        return _registerNodeRunner(_msgSender());
    }

    function _registerNodeRunner(address nodeRunner) internal returns (uint256 nodeRunnerId) {
        _nodeRunnerIdCounter.increment();
        nodeRunnerId = _nodeRunnerIdCounter.current();
        _safeMint(nodeRunner, nodeRunnerId);
        return nodeRunnerId;
    }

    // ************* Scanner ownership *************

    /**
     * @notice Checks if scannerId has been registered (minted).
     * @param scanner ERC721 token id of the scanner.
     * @return true if scannerId is registered, false otherwise.
     */
    function isScannerRegistered(address scanner) public view returns (bool) {
        return _scannerNodes[scanner].registered;
    }

    function isScannerRegisteredTo(address scanner, uint256 nodeRunnerId) public view returns (bool) {
        return _scannerNodeOwnership[nodeRunnerId].contains(scanner);
    }

    function registerScannerNode(ScannerNodeRegistration calldata req, bytes calldata signature) external onlyOwnerOf(req.nodeRunnerId) {
        if (req.timestamp + registrationDelay < block.timestamp) revert RegisteringTooLate();
        if (isScannerRegistered(req.scanner)) revert ScannerExists(req.scanner);
        if (
            !SignatureCheckerUpgradeable.isValidSignatureNow(
                req.scanner,
                _hashTypedDataV4(
                    keccak256(
                        abi.encode(_SCANNERNODEREGISTRATION_TYPEHASH, req.scanner, req.nodeRunnerId, req.chainId, keccak256(abi.encodePacked(req.metadata)), req.timestamp)
                    )
                ),
                signature
            )
        ) revert SignatureDoesNotMatch();
        _scannerNodes[req.scanner] = ScannerNode(true, false, req.chainId, req.metadata);
        if (!_scannerNodeOwnership[req.nodeRunnerId].add(req.scanner)) revert ScannerAlreadyRegisteredTo(req.scanner, req.nodeRunnerId);
        emit ScannerUpdated(scannerAddressToId(req.scanner), req.chainId, req.metadata, req.nodeRunnerId);
    }

    function updateScannerMetadata(
        uint256 nodeRunnerId,
        address scanner,
        string calldata metadata
    ) external onlyOwnerOf(nodeRunnerId) onlyScannerRegisteredTo(scanner, nodeRunnerId) {
        if (!isScannerRegistered(scanner)) revert ScannerNotRegistered(scanner);
        _scannerNodes[scanner].metadata = metadata;
        emit ScannerUpdated(scannerAddressToId(scanner), _scannerNodes[scanner].chainId, metadata, nodeRunnerId);
    }

    function ownerOfScanner(address scanner) external view returns (address) {
        return _scannerNodes[scanner].owner;
    }

    function totalScannersOwned(uint256 nodeRunnerId) external view returns (uint256) {
        return _scannerNodeOwnership[nodeRunnerId].length();
    }

    function ownedScannerAddressAtIndex(uint256 nodeRunnerId, uint256 index) external view returns (address) {
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

    function isDisabled(address scanner) public view returns (bool) {
        return _scannerNodes[scanner].disabled;
    }

    function isEnabled(address scanner) public view returns (bool) {
        return _scannerNodes[scanner].registered &&
            !_scannerNodes[scanner].disabled &&
            _isStakedOverMin(scannerAddressToId(scanner)); 
    }

    function _canSetEnableState(address scanner) internal view returns (bool) {
        return _msgSender() == scanner || _msgSender() == _scannerNodes[scanner].owner;
    }


    function enableScanner(address scanner) public {
        if (!_canSetEnableState(scanner)) revert CannotSetScannerActivation();
        uint256 scannerId = scannerAddressToId(scanner);
        if (!_isStakedOverMin(scannerId)) revert StakedUnderMinimum(scannerId);
        _setScannerActivation(scanner, true);
    }

    function disableScanner(address scanner) public {
        if (!_canSetEnableState(scanner)) revert CannotSetScannerActivation();
        _setScannerActivation(scanner, false);
    }

    function _setScannerActivation(address scanner, bool value) private {
        _scannerNodes[scanner].disabled = value;
        emit ScannerEnabled(scannerAddressToId(scanner), isEnabled(scanner), _msgSender(), value);
    }

    

    // ************* Scanner Getters *************


    function getScanner(address scanner) public view returns (ScannerNode memory) {
        return _scannerNodes[scanner];
    }

    function getScannerState(uint256 scannerId)
        external
        view
        returns (
            bool registered,
            address owner,
            uint256 chainId,
            string memory metadata,
            bool enabled,
            bool disabled
        )
    {
        ScannerNode memory scanner = getScanner(scannerIdToAddress(scannerId));

        return (
            scanner.registered,
            scanner.owner,
            scanner.chainId,
            scanner.metadata,
            scanner.disabled,
            scanner.disabled
        );
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
        return getStakeController().activeStakeFor(SCANNER_SUBJECT, scannerId) >= getStakeThreshold(scannerId).min && _exists(scannerId);
    }

    // ************* Priviledge setters ***************

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

    uint256[44] private __gap; // 50 - 1 (_stakeThresholds) - 5 (StakeSubjectUpgradeable)
}
