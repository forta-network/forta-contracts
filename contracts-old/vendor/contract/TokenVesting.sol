// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/contracts/utils/Context.sol";

/**
 * @title TokenVesting
 * @dev A token holder contract that can release its token balance gradually like a
 * typical vesting scheme, with a cliff and vesting period. Optionally revocable by the
 * owner.
 */
abstract contract TokenVesting is Context {
    // beneficiary of tokens after they are released
    address private _beneficiary;

    mapping (address => uint256) private _released;

    event TokensReleased(address token, uint256 amount);

    modifier onlyBeneficiary() {
        require(beneficiary() == _msgSender(), "TokenVesting: access restricted to beneficiary");
        _;
    }

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
     */
    function release(address token) public {
        uint256 releasable = _releasableAmount(token, block.timestamp);

        require(releasable > 0, "TokenVesting: no tokens are due");

        _released[token] += releasable;

        SafeERC20.safeTransfer(IERC20(token), beneficiary(), releasable);

        emit TokensReleased(token, releasable);
    }

    /**
    * @dev Calculates the amount that has already vested.
    */
    function vestedAmount(address token, uint256 timestamp) public virtual view returns (uint256) {
        return _vestedAmount(token, timestamp);
    }

    /**
     * @notice Calculates the historical balance (current balance + already released balance).
     */
    function _historicalBalance(address token) internal virtual view returns (uint256) {
        return IERC20(token).balanceOf(address(this)) + released(token);
    }

    /**
     * @notice Calculates the amount that has already vested but hasn't been released yet.
     */
    function _releasableAmount(address token, uint256 timestamp) internal virtual view returns (uint256) {
        return _vestedAmount(token, timestamp) - released(token);
    }

    /**
     * @dev Calculates the amount that has already vested.
     */
    function _vestedAmount(address token, uint256) internal virtual view returns (uint256) {
        return _historicalBalance(token);
    }
}
