// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../TokenVesting.sol";

abstract contract DeadlineVesting is TokenVesting {
    uint256 private _deadline;

    constructor (uint256 deadline_) {
        _deadline = deadline_;
    }

    function deadline() public view virtual returns (uint256) {
        return _deadline;
    }

    function _vestedAmount(address token, uint256 timestamp) internal virtual override view returns (uint256) {
        if (timestamp < deadline()) {
            return 0;
        } else {
            return super._vestedAmount(token, timestamp);
        }
    }

}
