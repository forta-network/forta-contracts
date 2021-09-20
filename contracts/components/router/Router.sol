// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "./IRouter.sol";
import "../BaseComponent.sol";

contract Router is IRouter, BaseComponent {
    using EnumerableSet for EnumerableSet.AddressSet;

    mapping(bytes4 => EnumerableSet.AddressSet) private _routingTable;

    event RoutingUpdated(bytes4 sig, address target, bool enable);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(address __manager) public initializer {
        __AccessManaged_init(__manager);
        __UUPSUpgradeable_init();
    }

    function hookHandler(bytes calldata payload) external override {
        bytes4 sig = bytes4(payload[:4]);
        uint256 length = _routingTable[sig].length();
        for (uint256 i = 0; i < length; ++i) {
            // Lazy, don't worry about calls failling here
            (bool success, bytes memory returndata) = _routingTable[sig].at(i).call(payload);
            success;
            returndata;
        }
    }

    function setRoutingTable(bytes4 sig, address target, bool enable) external onlyRole(ROUTER_ADMIN_ROLE) {
        if (enable) {
            _routingTable[sig].add(target);
        } else {
            _routingTable[sig].remove(target);
        }
        emit RoutingUpdated(sig, target, enable);
    }
}