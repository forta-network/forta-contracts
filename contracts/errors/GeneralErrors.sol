// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

error ZeroAddress(string name);
error ZeroAmount(string name);
error EmptyArray(string name);
error EmptyString(string name);
error UnorderedArray(string name);
error DifferentLengthArray(string array1, string array2);
error ArrayTooBig(uint256 length, uint256 max);
error StringTooLarge(uint256 length, uint256 max);
error AmountTooLarge(uint256 amount, uint256 max);
error AmountTooSmall(uint256 amount, uint256 min);

error UnsupportedInterface(string name);

error SenderNotOwner(address sender, uint256 ownedId);
error DoesNotHaveAccess(address sender, string access);

// Permission here refers to XXXRegistry.sol Permission enums
error DoesNotHavePermission(address sender, uint8 permission, uint256 id);
