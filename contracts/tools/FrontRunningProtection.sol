// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract FrontRunningProtection {
    mapping(bytes32 => uint256) private _commits;

    modifier frontrunProtected(bytes32 commit, uint256 duration) {
        uint256 timestamp = _commits[commit];
        require(duration == 0 || (timestamp != 0 && timestamp + duration <= block.timestamp), "Commit not ready");
        delete _commits[commit];
        _;
    }

    function _frontrunCommit(bytes32 commit) internal {
        require(_commits[commit] == 0, "Commit already exists");
        _commits[commit] = block.timestamp;
    }
}