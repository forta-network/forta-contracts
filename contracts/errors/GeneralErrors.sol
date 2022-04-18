// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.4;

error ZeroAddress(string name);
error ZeroAmount(string name);
error EmptyArray(string name);
error UnorderedArray(string name);
error UnsupportedInterface(string name);

error SenderNotOwner(address sender, uint256 ownedId);
error DoesNotHaveAccess(address sender, string access);

// Permission here refers to XXXRegistry.sol Permission enums
error DoesNotHavePermission(address sender, uint8 permission, uint256 id);
