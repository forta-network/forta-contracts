// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/contracts/token/ERC20/extensions/draft-IERC20Votes.sol";
import "@openzeppelin/contracts-upgradeable/contracts/proxy/utils/UUPSUpgradeable.sol";
import "./vendor/upgradeable/CliffVestingUpgradeable.sol";

contract VestingWallet is CliffVestingUpgradeable, UUPSUpgradeable {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer
    {}

    function initialize(
        address beneficiary_,
        address admin_,
        uint256 start_,
        uint256 cliffDuration_,
        uint256 duration_
    ) external initializer {
        __Ownable_init();
        __CliffVesting_init(beneficiary_, admin_, start_, cliffDuration_, duration_);
    }

    function delegate(address token, address delegatee) public {
        require(beneficiary() == _msgSender(), "VestingWallet: access restricted to beneficiary");
        IERC20Votes(token).delegate(delegatee);
    }

    // Access control for the upgrade process
    function _authorizeUpgrade(address newImplementation)
    internal virtual override onlyOwner()
    {}
}
