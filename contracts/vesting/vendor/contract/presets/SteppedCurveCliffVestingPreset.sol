// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../extensions/SteppedCurveVesting.sol";
import "../extensions/DeadlineVesting.sol";
import "../extensions/RevokableVesting.sol";

contract SteppedCurveCliffVestingPreset is SteppedCurveVesting, DeadlineVesting, RevokableVesting {
    constructor(address beneficiary_, uint256 start_, uint256 duration_, uint256 stepduration_, uint8 curvature_, uint256 deadline_)
    TokenVesting(beneficiary_)
    SteppedCurveVesting(start_, duration_, stepduration_, curvature_)
    DeadlineVesting(deadline_)
    RevokableVesting(msg.sender)
    {}

    function vestedAmount(address token, uint256 timestamp) public virtual override(TokenVesting, RevokableVesting) view returns (uint256) {
        return super.vestedAmount(token, timestamp);
    }

    function _vestedAmount(address token, uint256 timestamp) internal virtual override(TokenVesting, SteppedCurveVesting, DeadlineVesting) view returns (uint256) {
        return super._vestedAmount(token, timestamp);
    }

    function _releasableAmount(address token, uint256 timestamp) internal virtual override(TokenVesting, RevokableVesting) view returns (uint256) {
        return super._releasableAmount(token, timestamp);
    }
}
