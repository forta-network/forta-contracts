// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../TokenVesting.sol";

abstract contract SteppedCurveVesting is TokenVesting {
    uint256 private _start;
    uint256 private _duration;
    uint256 private _stepduration;
    uint8 private _curvature;

    constructor (uint256 start_, uint256 duration_, uint256 stepduration_, uint8 curvature_) {
        _start = start_;
        _duration = duration_;
        _curvature = curvature_;
        _stepduration = stepduration_;
    }

    function start() public view virtual returns (uint256) {
        return _start;
    }

    function duration() public view virtual returns (uint256) {
        return _duration;
    }

    function curvature() public view virtual returns (uint8) {
        return _curvature;
    }

    function _vestedAmount(address token, uint256 timestamp) internal virtual override view returns (uint256) {
        if (timestamp < start()) {
            return 0;
        } else if (timestamp >= start() + duration()) {
            return super._vestedAmount(token, timestamp);
        } else {
            uint256 vested = super._vestedAmount(token, timestamp);
            return vested
                - vested
                * stepUp(start() + duration() - timestamp, _stepduration) ** curvature()
                / duration() ** curvature();
        }
    }

    // function step(uint256 value, uint256 increment) internal pure returns (uint256) {
    //     return value / increment * increment;
    // }

    function stepUp(uint256 value, uint256 increment) internal pure returns (uint256) {
        return (value / increment * increment) + (value % increment == 0 ? 0 : increment);
    }
}
