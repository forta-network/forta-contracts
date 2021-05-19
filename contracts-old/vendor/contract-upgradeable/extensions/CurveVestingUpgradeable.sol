// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../TokenVestingUpgradeable.sol";

abstract contract CurveVestingUpgradeable is TokenVestingUpgradeable {
    uint256 private _start;
    uint256 private _duration;
    uint8 private _curvature;

    function __CurveVesting_init_unchained(uint256 start_, uint256 duration_, uint8 curvature_) public initializer {
        _start = start_;
        _duration = duration_;
        _curvature = curvature_;
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
            return vested - vested * (start() + duration() - timestamp) ** curvature() / duration() ** curvature();
        }
    }
}
