// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./AccessManaged.sol";
import "../router/IRouter.sol";

abstract contract RoutedUpgradeable is AccessManagedUpgradeable {
    IRouter private _router;

    event RouterUpdated(address indexed router);

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param router address of Routed.
     */
    function __Routed_init(address router) internal initializer {
        _router = IRouter(router);
        emit RouterUpdated(router);
    }

    /**
     * @dev Routed contracts can use this method to notify the subscribed observers registered
     * in Router routing table.
     * @param data keccak256 of the method signature and param values the listener contracts.
     * will execute.
     */
    function _emitHook(bytes memory data) internal {
        if (address(_router) != address(0)) {
            try _router.hookHandler(data) {}
            catch {}
        }
    }

    /// Sets new Router instance. Restricted to DEFAULT_ADMIN_ROLE.
    function setRouter(address newRouter) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _router = IRouter(newRouter);
        emit RouterUpdated(newRouter);
    }

    uint256[49] private __gap;
}