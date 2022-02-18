// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract FrontRunningProtection {
    mapping(bytes32 => uint256) private _commits;

    error CommitNotReady();
    error CommitAlreadyExists();

    modifier frontrunProtected(bytes32 commit, uint256 duration) {
        uint256 timestamp = _commits[commit];
        if (!(duration == 0 || (timestamp != 0 && timestamp + duration <= block.timestamp))) revert CommitNotReady();
        delete _commits[commit];
        _;
    }

    function _frontrunCommit(bytes32 commit) internal {
        if (_commits[commit] != 0) revert CommitAlreadyExists();
        _commits[commit] = block.timestamp;
    }
}