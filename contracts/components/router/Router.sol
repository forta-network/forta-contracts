// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/Multicall.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../Roles.sol";
import "../utils/AccessManaged.sol";
import "../utils/ForwardedContext.sol";
import "../utils/IVersioned.sol";
import "../../tools/ENSReverseRegistration.sol";
import "./IRouter.sol";

// This should be BaseComponentUpgradeable, but it can't be because BaseComponentUpgradeable is Routed, so we
// share almost the same inheritance structure.
contract Router is IRouter, ForwardedContext, AccessManagedUpgradeable, UUPSUpgradeable, Multicall, IVersioned {
    using EnumerableSet for EnumerableSet.AddressSet;

    mapping(bytes4 => EnumerableSet.AddressSet) private _routingTable;
    mapping(bytes4 => bool) private _revertsOnFail;

    uint256 private constant SIGNATURE_SIZE = 4;
    string public constant version = "0.1.0";

    event RoutingUpdated(bytes4 indexed sig, address indexed target, bool enable, bool revertsOnFail);

    error HookFailed(bytes4 sig, uint256 at);
    error AlreadyRouted();
    error NotInRoutingTable();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     */
    function initialize(address __manager) public initializer {
        __AccessManaged_init(__manager);
        __UUPSUpgradeable_init();
    }

    /**
     * @notice Method that executes all the listeners in the routing table for a payload.
     * @dev hooks can fail without the error bubling up.
     * @param payload with the method signature and parameters for the hook to be executed
     */
    function hookHandler(bytes calldata payload) external override {
        bytes4 sig = bytes4(payload[:SIGNATURE_SIZE]);
        uint256 length = _routingTable[sig].length();
        for (uint256 i = 0; i < length; i++) {
            (bool success, bytes memory returndata) = _routingTable[sig].at(i).call(payload);
            if (_revertsOnFail[sig]) {
                if (!success) revert HookFailed(sig, i);
            }
            success;
            returndata;
        }
    }

    /**
     * @notice Adds or removes a listener that will react to a certain hook.
     * @param sig the hook signature to listen to.
     * @param target address of the listening contract.
     * @param enable true if adding to the list, false to remove.
     * @param revertsOnFail true if hook execution failure should bubble up, false to ignore.
     */
    function setRoutingTable(bytes4 sig, address target, bool enable, bool revertsOnFail) external onlyRole(ROUTER_ADMIN_ROLE) {
        if (enable) {
            if (!_routingTable[sig].add(target)) revert AlreadyRouted();
            _revertsOnFail[sig] = revertsOnFail;
        } else {
            if (!_routingTable[sig].remove(target)) revert NotInRoutingTable();
            _revertsOnFail[sig] = false;
        }
        emit RoutingUpdated(sig, target, enable, revertsOnFail);
    }


    /// Access control for the upgrade process
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyRole(UPGRADER_ROLE) {
    }

    /// Allow the upgrader to set ENS reverse registration
    function setName(address ensRegistry, string calldata ensName) public onlyRole(ENS_MANAGER_ROLE) {
        ENSReverseRegistration.setName(ensRegistry, ensName);
    }

    /**
     * @notice Helper to get either msg msg.sender if not a meta transaction, signer of forwarder metatx if it is.
     * @inheritdoc ForwardedContext
     */
    function _msgSender() internal view virtual override(ContextUpgradeable, ForwardedContext) returns (address sender) {
        return super._msgSender();
    }

    /**
     * @notice Helper to get msg.data if not a meta transaction, forwarder data in metatx if it is.
     * @inheritdoc ForwardedContext
     */
    function _msgData() internal view virtual override(ContextUpgradeable, ForwardedContext) returns (bytes calldata) {
        return super._msgData();
    }

    uint256[48] private __gap;
}