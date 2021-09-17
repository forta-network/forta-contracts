// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./AccessManaged.sol";
import "../router/IRouter.sol";

abstract contract Routed is AccessManaged {
    IRouter private _router;

    event RouterUpdated(address indexed router);

    constructor(address router) {
        _router = IRouter(router);
        emit RouterUpdated(router);
    }

    function _emitHook(bytes memory data) internal {
        if (address(_router) != address(0)) {
            _router.hookHandler(data);
        }
    }

    function setRouter(address newRouter) public onlyRole(ADMIN_ROLE) {
        _router = IRouter(newRouter);
        emit RouterUpdated(newRouter);
    }
}

abstract contract RoutedUpgradeable is AccessManagedUpgradeable {
    IRouter private _router;

    event RouterUpdated(address indexed router);

    function __Routed_init(address router) internal initializer {
        _router = IRouter(router);
        emit RouterUpdated(router);
    }

    function _emitHook(bytes memory data) internal {
        if (address(_router) != address(0)) {
            _router.hookHandler(data);
        }
    }

    function setRouter(address newRouter) public onlyRole(ADMIN_ROLE) {
        _router = IRouter(newRouter);
        emit RouterUpdated(newRouter);
    }
}