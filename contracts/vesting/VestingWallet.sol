// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/contracts/token/ERC20/extensions/draft-IERC20Votes.sol";
import "@openzeppelin/contracts-upgradeable/contracts/proxy/utils/UUPSUpgradeable.sol";
// import "./vendor/upgradeable-old/CliffVestingUpgradeable.sol";
import "./vendor/contract-upgradeable/extensions/CurveVestingUpgradeable.sol";
import "./vendor/contract-upgradeable/extensions/DeadlineVestingUpgradeable.sol";
import "./vendor/contract-upgradeable/extensions/RevokableVestingUpgradeable.sol";

contract VestingWallet is CurveVestingUpgradeable, DeadlineVestingUpgradeable, RevokableVestingUpgradeable, UUPSUpgradeable {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer
    {}

    function initialize(
        address beneficiary_,
        address admin_,
        uint256 begin_,
        uint256 cliff_,
        uint256 end_
    ) external initializer {
        __TokenVesting_init_unchained(beneficiary_);
        __RevokableVesting_init(admin_);
        __CurveVesting_init_unchained(begin_, end_ - begin_, 1); // linear
        __DeadlineVesting_init_unchained(cliff_);
    }

    function vestedAmount(address token, uint256 timestamp) public virtual override(TokenVestingUpgradeable, RevokableVestingUpgradeable) view returns (uint256) {
        return super.vestedAmount(token, timestamp);
    }

    function _vestedAmount(address token, uint256 timestamp) internal virtual override(TokenVestingUpgradeable, CurveVestingUpgradeable, DeadlineVestingUpgradeable) view returns (uint256) {
        return super._vestedAmount(token, timestamp);
    }

    function _releasableAmount(address token, uint256 timestamp) internal virtual override(TokenVestingUpgradeable, RevokableVestingUpgradeable) view returns (uint256) {
        return super._releasableAmount(token, timestamp);
    }

    function delegate(address token, address delegatee) public onlyBeneficiary() {
        IERC20Votes(token).delegate(delegatee);
    }

    // Access control for the upgrade process
    function _authorizeUpgrade(address newImplementation)
    internal virtual override onlyOwner()
    {}
}
