// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../TokenVesting.sol";

abstract contract DeadlineVesting is TokenVesting {
    uint256 private _releaseDate;

    constructor (uint256 releaseDate_) {
        _releaseDate = releaseDate_;
    }

    function releaseDate() public view virtual returns (uint256) {
        return _releaseDate;
    }

    function _vestedAmount(address token, uint256 timestamp) internal virtual override view returns (uint256) {
        if (timestamp < releaseDate()) {
            return 0;
        } else {
            return super._vestedAmount(token, timestamp);
        }
    }

}
