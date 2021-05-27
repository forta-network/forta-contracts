// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/contracts/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/contracts/token/ERC20/extensions/ERC20VotesUpgradeable.sol";

interface IFortify is IAccessControlUpgradeable, IERC20VotesUpgradeable {}
