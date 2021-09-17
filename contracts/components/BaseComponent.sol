// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Multicall.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "./utils/AccessManaged.sol";
import "./utils/Routed.sol";
import "../tools/ENSReverseRegistration.sol";

contract BaseComponent is
    AccessManagedUpgradeable,
    RoutedUpgradeable,
    Multicall,
    UUPSUpgradeable
{
    // Access control for the upgrade process
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyRole(ADMIN_ROLE) {
    }

    // Allow the upgrader to set ENS reverse registration
    function setName(address ensRegistry, string calldata ensName) public onlyRole(ADMIN_ROLE) {
        ENSReverseRegistration.setName(ensRegistry, ensName);
    }
}