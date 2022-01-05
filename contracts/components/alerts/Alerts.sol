//SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.0;

import "../BaseComponent.sol";
import "../scanners/ScannerRegistry.sol";

contract Alerts is BaseComponent {
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
        require(scannerRegistry.ownerOf(uint256(uint160(_msgSender()))) != address(0), "AlertBatch: Scanner does not exist");
        //TODO this will validate stake requirements
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    function initialize(
        address __manager,
        address __router,
        address __scannerRegistry
    ) public initializer {
        __AccessManaged_init(__manager);
        __Routed_init(__router);
        __UUPSUpgradeable_init();

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
        require(_blockEnd >= _blockStart, "AlertBatch: _blockEnd must be >= _blockStart");

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
        require(newScannerRegistry != address(0), "AlertBatch: Address(0) is not allowed");
        emit ScannerRegistryChanged(address(scannerRegistry), newScannerRegistry, _msgSender());

        scannerRegistry = ScannerRegistry(newScannerRegistry);
    }

    uint256[49] private __gap;
}
