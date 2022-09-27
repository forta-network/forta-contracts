// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "./AccessManaged.sol";

/**
 * Since Router is deprecated, we are keeping RoutedUpgradeable in this state to preserve storage
 * layout in deployed `BaseComponentUpgradeable` contracts.
 */
abstract contract RoutedUpgradeable is AccessManagedUpgradeable {

    /// @custom:oz-renamed-from _router
    address private _deprecated_router;

    event RouterUpdated(address indexed router);

    /// Sets Router instance to address(0). Restricted to DEFAULT_ADMIN_ROLE.
    function disableRouter() public onlyRole(DEFAULT_ADMIN_ROLE) {
        _deprecated_router = address(0);
        emit RouterUpdated(address(0));
    }

    uint256[49] private __gap;
}