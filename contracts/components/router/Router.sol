// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Multicall.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../Roles.sol";
import "../utils/AccessManaged.sol";
import "../utils/ForwardedContext.sol";
import "../../tools/ENSReverseRegistration.sol";
import "./IRouter.sol";

// This should be BaseComponent, because BaseComponent is Routed
contract Router is IRouter, ForwardedContext, AccessManagedUpgradeable, UUPSUpgradeable, Multicall {
    using EnumerableSet for EnumerableSet.AddressSet;

    mapping(bytes4 => EnumerableSet.AddressSet) private _routingTable;

    event RoutingUpdated(bytes4 indexed sig, address indexed target, bool enable);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    function initialize(address __manager) public initializer {
        __AccessManaged_init(__manager);
        __UUPSUpgradeable_init();
    }

    function hookHandler(bytes calldata payload) external override {
        bytes4 sig = bytes4(payload[:4]);
        uint256 length = _routingTable[sig].length();
        for (uint256 i = 0; i < length; ++i) {
            // Lazy, don't worry about calls failing here
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


    // Access control for the upgrade process
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyRole(UPGRADER_ROLE) {
    }

    // Allow the upgrader to set ENS reverse registration
    function setName(address ensRegistry, string calldata ensName) public onlyRole(DEFAULT_ADMIN_ROLE) {
        ENSReverseRegistration.setName(ensRegistry, ensName);
    }

    function _msgSender() internal view virtual override(ContextUpgradeable, ForwardedContext) returns (address sender) {
        return super._msgSender();
    }

    function _msgData() internal view virtual override(ContextUpgradeable, ForwardedContext) returns (bytes calldata) {
        return super._msgData();
    }

    uint256[49] private __gap;
}