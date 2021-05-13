// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/contracts/access/OwnableUpgradeable.sol";

/**
 * @title TokenVesting
 * @dev A token holder contract that can release its token balance gradually like a
 * typical vesting scheme, with a cliff and vesting period. Optionally revocable by the
 * owner.
 */
abstract contract TokenVestingCoreUpgradeable is OwnableUpgradeable {
    event TokensReleased(address token, uint256 amount);
    event TokenVestingRevoked(address token);

    // beneficiary of tokens after they are released
    address private _beneficiary;

    mapping (address => uint256) private _released;
    mapping (address => bool) private _revoked;

    function __TokenVestingCore_init(
        address beneficiary_,
        address admin_
    ) internal initializer {
        __Ownable_init();
        __TokenVesting_init_unchained(beneficiary_, admin_);
    }

    /**
     * @dev Creates a vesting contract that vests its balance of any ERC20 token to the
     * beneficiary, gradually in a linear fashion until start + duration. By then all
     * of the balance will have vested.
     * @param beneficiary_ address of the beneficiary to whom vested tokens are transferred
     * @param admin_ address of the administrator that can revocate tokens, use address(0) to disable revokability
     */
    function __TokenVesting_init_unchained(
        address beneficiary_,
        address admin_
    ) internal initializer {
        // add checks
        if (admin_ == address(0)) {
            renounceOwnership();
        } else {
            transferOwnership(admin_);
        }

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
     * @return true if the token is revoked.
     */
    function revoked(address token) public view returns (bool) {
        return _revoked[token];
    }

    /**
     * @notice Transfers vested tokens to beneficiary.
     * @param token ERC20 token which is being vested
     */
    function release(IERC20 token) public {
        uint256 unreleased = _releasableAmount(token);

        require(unreleased > 0, "TokenVesting: no tokens are due");

        _released[address(token)] += unreleased;

        SafeERC20.safeTransfer(token, beneficiary(), unreleased);

        emit TokensReleased(address(token), unreleased);
    }

    /**
     * @notice Allows the owner to revoke the vesting. Tokens already vested
     * remain in the contract, the rest are returned to the owner.
     * @param token ERC20 token which is being vested
     */
    function revoke(IERC20 token) public onlyOwner() {
        require(!_revoked[address(token)], "TokenVesting: token already revoked");

        uint256 balance = token.balanceOf(address(this));
        uint256 unreleased = _releasableAmount(token);
        uint256 refund = balance - unreleased;

        _revoked[address(token)] = true;

        SafeERC20.safeTransfer(token, owner(), refund);

        emit TokenVestingRevoked(address(token));
    }

    /**
     * @dev Calculates the amount that has already vested but hasn't been released yet.
     * @param token ERC20 token which is being vested
     */
    function _releasableAmount(IERC20 token) private view returns (uint256) {
        return _vestedAmount(token) - _released[address(token)];
    }

    /**
     * @dev Calculates the amount that has already vested.
     * @param token ERC20 token which is being vested
     */
    function _vestedAmount(IERC20 token) internal virtual view returns (uint256);
}
