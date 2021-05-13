// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./TokenVestingCoreUpgradeable.sol";

contract CliffVestingUpgradeable is TokenVestingCoreUpgradeable {
    // Durations and timestamps are expressed in UNIX time, the same units as block.timestamp.
    uint256 private _start;
    uint256 private _duration;
    uint256 private _cliff;

    function __CliffVesting_init(address beneficiary_, address admin_, uint256 start_, uint256 cliffDuration_, uint256 duration_) internal initializer {
        __Ownable_init();
        __TokenVestingCore_init(beneficiary_, admin_);
        __CliffVesting_init_unchained(beneficiary_, admin_, start_, cliffDuration_, duration_);
    }

    function __CliffVesting_init_unchained(address beneficiary_, address admin_, uint256 start_, uint256 cliffDuration_, uint256 duration_) internal initializer {
        _start = start_;
        _duration = duration_;
        _cliff = start_ + cliffDuration_;
    }

    /**
     * @return the start time of the token vesting.
     */
    function start() public view virtual returns (uint256) {
        return _start;
    }

    /**
     * @return the duration of the token vesting.
     */
    function duration() public view virtual returns (uint256) {
        return _duration;
    }

    /**
     * @return the cliff time of the token vesting.
     */
    function cliff() public view virtual returns (uint256) {
        return _cliff;
    }

    /**
     * @dev Calculates the amount that has already vested.
     * @param token ERC20 token which is being vested
     */
    function _vestedAmount(IERC20 token) internal virtual override view returns (uint256) {
        uint256 currentBalance = token.balanceOf(address(this));
        uint256 totalBalance = currentBalance + released(address(token));

        if (block.timestamp < cliff()) {
            return 0;
        } else if (block.timestamp >= start() + duration() || revoked(address(token))) {
            return totalBalance;
        } else {
            return totalBalance * (block.timestamp - start()) / duration();
        }
    }

}
