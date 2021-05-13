// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../extensions/CurveVesting.sol";
import "../extensions/DeadlineVesting.sol";

contract CurveCliffVestingPreset is CurveVesting, DeadlineVesting {
    constructor(address beneficiary_, uint256 start_, uint256 duration_, uint8 curvature_, uint256 deadline_)
    TokenVesting(beneficiary_)
    CurveVesting(start_, duration_, curvature_)
    DeadlineVesting(deadline_)
    {}

    function _vestedAmount(address token, uint256 timestamp) internal virtual override(CurveVesting, DeadlineVesting) view returns (uint256) {
        return super._vestedAmount(token, timestamp);
    }

    function vestedAmount(address token, uint256 timestamp) external view returns (uint256) {
        return _vestedAmount(token, timestamp);
    }
}
