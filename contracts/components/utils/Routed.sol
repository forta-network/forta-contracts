// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.4;

import "./AccessManaged.sol";

/**
 * Deprecated.
 */
abstract contract RoutedUpgradeable is AccessManagedUpgradeable {
    address private _router;

    event RouterUpdated(address indexed router);

    /// Sets Router instance to address(0). Restricted to DEFAULT_ADMIN_ROLE.
    function disableRouter() public onlyRole(DEFAULT_ADMIN_ROLE) {
        _router = address(0);
        emit RouterUpdated(address(0));
    }

    uint256[49] private __gap;
}