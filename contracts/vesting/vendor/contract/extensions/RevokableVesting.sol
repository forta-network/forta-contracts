// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../TokenVesting.sol";

abstract contract RevokableVesting is Ownable, TokenVesting {
    mapping (address => bool) private _revoked;

    event TokenVestingRevoked(address token);

    constructor (address admin_) {
        if (admin_ == address(0)) {
            renounceOwnership();
        } else {
            transferOwnership(admin_);
        }
    }

    /**
     * @return true if the token is revoked.
     */
    function revoked(address token) public view returns (bool) {
        return _revoked[token];
    }

    /**
     * @notice Allows the owner to revoke the vesting. Tokens already vested
     * remain in the contract, the rest are returned to the owner.
     * @param token ERC20 token which is being vested
     */
    function revoke(address token) public onlyOwner() {
        require(!revoked(token), "TokenVesting: token already revoked");

        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 releasable = _releasableAmount(token, block.timestamp);
        uint256 refund = balance - releasable;

        _revoked[token] = true;

        SafeERC20.safeTransfer(IERC20(token), owner(), refund);

        emit TokenVestingRevoked(token);
    }

    /**
     * @dev Calculates the amount that has already vested.
     * @param token ERC20 token which is being vested
     */
    function _vestedAmount(address token, uint256 timestamp) internal virtual override view returns (uint256) {
        if (revoked(token)) {
            return _historicalBalance(token);
        } else {
            return super._vestedAmount(token, timestamp);
        }
    }
}
