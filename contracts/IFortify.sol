// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// import "@openzeppelin/contracts/contracts/access/AccessControl.sol";
// import "@openzeppelin/contracts/contracts/token/ERC20/extensions/draft-IERC20Votes.sol";
// interface IFortify is IAccessControl, IERC20Votes {}

import "@openzeppelin/contracts-upgradeable/contracts/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/contracts/token/ERC20/extensions/draft-ERC20VotesUpgradeable.sol";

interface IFortify is IAccessControlUpgradeable, IERC20VotesUpgradeable {}
