// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../TokenVestingUpgradeable.sol";

abstract contract DeadlineVestingUpgradeable is TokenVestingUpgradeable {
    uint256 private _releaseDate;

    function __DeadlineVesting_init_unchained(uint256 releaseDate_) public initializer {
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
