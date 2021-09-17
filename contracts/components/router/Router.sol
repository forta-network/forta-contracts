// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

import "../BaseComponent.sol";
import "./IRouter.sol";

contract Router is IRouter, BaseComponent {
    using EnumerableSet for EnumerableSet.AddressSet;

    bytes32 public constant ROUTER_ADMIN = keccak256("ROUTER_ADMIN");

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
            AddressUpgradeable.functionCall(_routingTable[sig].at(i), payload);
        }
    }

    function setRoutingTable(bytes4 sig, address target, bool enable) external onlyRole(ROUTER_ADMIN) {
        if (enable) {
            _routingTable[sig].add(target);
        } else {
            _routingTable[sig].remove(target);
        }
        emit RoutingUpdated(sig, target, enable);
    }
}