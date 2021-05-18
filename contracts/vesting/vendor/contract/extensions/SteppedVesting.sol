// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../TokenVesting.sol";

abstract contract SteppedVesting is TokenVesting {
    uint256 private _stepduration;

    constructor (uint256 stepduration_) {
        _stepduration = stepduration_;
    }

    function stepduration() public view virtual returns (uint256) {
        return _stepduration;
    }

    function _vestedAmount(address token, uint256 timestamp) internal virtual override view returns (uint256) {
        return super._vestedAmount(token, timestamp / _stepduration * _stepduration);
    }
}
