// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title TokenVesting
 * @dev A token holder contract that can release its token balance gradually like a
 * typical vesting scheme, with a cliff and vesting period. Optionally revocable by the
 * owner.
 */
abstract contract TokenVesting is Ownable {
    // beneficiary of tokens after they are released
    address private _beneficiary;

    mapping (address => uint256) private _released;

    event TokensReleased(address token, uint256 amount);

    /**
     * @dev Creates a vesting contract that vests its balance of any ERC20 token to the
     * beneficiary, gradually in a linear fashion until start + duration. By then all
     * of the balance will have vested.
     * @param beneficiary_ address of the beneficiary to whom vested tokens are transferred
     */
    constructor (address beneficiary_) {
        _beneficiary = beneficiary_;
    }

    /**
     * @return the beneficiary of the tokens.
     */
    function beneficiary() public view virtual returns (address) {
        return _beneficiary;
    }

    /**
     * @return the amount of the token released.
     */
    function released(address token) public view returns (uint256) {
        return _released[token];
    }

    /**
     * @notice Transfers vested tokens to beneficiary.
     * @param token ERC20 token which is being vested
     */
    function release(address token) public {
        uint256 unreleased = _vestedAmount(token, block.timestamp) - released(token);

        require(unreleased > 0, "TokenVesting: no tokens are due");

        _released[token] += unreleased;

        SafeERC20.safeTransfer(IERC20(token), beneficiary(), unreleased);

        emit TokensReleased(token, unreleased);
    }

    /**
     * @notice Calculates the historical balance (current balance + already released balance).
     * @param token ERC20 token which is being vested
     */
    function _historicalBalance(address token) internal view returns (uint256) {
        return IERC20(token).balanceOf(address(this)) + released(token);
    }

    /**
     * @notice Calculates the amount that has already vested but hasn't been released yet.
     * @param token ERC20 token which is being vested
     */
    function _releasableAmount(address token, uint256 timestamp) internal view returns (uint256) {
        return _vestedAmount(token, timestamp) - released(token);
    }

    /**
     * @dev Calculates the amount that has already vested.
     * @param token ERC20 token which is being vested
     */
    function _vestedAmount(address token, uint256 timestamp) internal virtual view returns (uint256) {
        return _historicalBalance(token);
    }
}
