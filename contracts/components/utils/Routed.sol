// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./AccessManaged.sol";
import "../router/IRouter.sol";

abstract contract RoutedUpgradeable is AccessManagedUpgradeable {
    IRouter private _router;

    event RouterUpdated(address indexed router);

    function __Routed_init(address router) internal initializer {
        _router = IRouter(router);
        emit RouterUpdated(router);
    }

    function _emitHook(bytes memory data) internal {
        if (address(_router) != address(0)) {
            try _router.hookHandler(data) {}
            catch {}
        }
    }

    function setRouter(address newRouter) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _router = IRouter(newRouter);
        emit RouterUpdated(newRouter);
    }

    uint256[49] private __gap;
}