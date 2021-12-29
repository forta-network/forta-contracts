//SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.0;

import "../BaseComponent.sol";
import "../scanners/ScannerRegistry.sol";
import "../utils/MinStakeAware.sol";

contract Alerts is BaseComponent, MinStakeAwareUpgradeable {
    ScannerRegistry public scannerRegistry;

    event AlertBatch(
        bytes32 indexed alertsId,
        address indexed scanner,
        uint256 indexed chainId,
        uint256 blockStart,
        uint256 blockEnd,
        uint256 alertCount,
        uint256 maxSeverity,
        string ref
    );

    event ScannerRegistryChanged(address from, address to, address by);

    modifier onlyValidScanner() {
        // TODO improve first check, ERC721 cannot be owned by address(0)
        require(scannerRegistry.ownerOf(uint256(uint160(_msgSender()))) != address(0), "Alerts: Scanner does not exist");
        require(scannerRegistry.isEnabled(uint256(uint160(_msgSender()))), "Alerts: Scanner not enabled");
        require(_isStakedOverMinimum(SCANNER_SUBJECT, uint256(uint160(_msgSender()))), "Alerts: Scanner is not staked over minimum");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    function initialize(
        address __manager,
        address __router,
        address __scannerRegistry,
        address __minStakeController
    ) public initializer {
        __AccessManaged_init(__manager);
        __Routed_init(__router);
        __UUPSUpgradeable_init();
        __MinStakeAwareUpgradeable_init(__minStakeController);
        scannerRegistry = ScannerRegistry(__scannerRegistry);
    }

    function addAlertBatch(
        uint256 _chainId,
        uint256 _blockStart,
        uint256 _blockEnd,
        uint256 _alertCount,
        uint256 _maxSeverity,
        string memory _ref
    ) public onlyValidScanner() {
        require(_blockEnd >= _blockStart, "_blockEnd must be >= _blockStart");

        emit AlertBatch(
            keccak256(abi.encodePacked(_ref)),
            _msgSender(),
            _chainId,
            _blockStart,
            _blockEnd,
            _alertCount,
            _maxSeverity,
            _ref
        );
    }

    function setScannerRegistry(address newScannerRegistry)
        public
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(newScannerRegistry != address(0), "Address(0) is not allowed");
        emit ScannerRegistryChanged(address(scannerRegistry), newScannerRegistry, _msgSender());

        scannerRegistry = ScannerRegistry(newScannerRegistry);
    }

    function _msgSender() internal view virtual override(BaseComponent, ContextUpgradeable) returns (address sender) {
        return super._msgSender();
    }

    function _msgData() internal view virtual override(BaseComponent, ContextUpgradeable) returns (bytes calldata) {
        return super._msgData();
    }

    uint256[49] private __gap;
}
