// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract VestingWallet is OwnableUpgradeable, UUPSUpgradeable {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer
    {}

    mapping (address => uint256) private _released;
    address private _beneficiary;
    uint256 private _start;
    uint256 private _cliff;
    uint256 private _duration;

    event TokensReleased(address indexed token, uint256 amount);

    modifier onlyBeneficiary() {
        require(beneficiary() == _msgSender(), "VestingWallet: access restricted to beneficiary");
        _;
    }

    /**
     * @param __duration Account that will receive vested tokens.
     * @param __admin Account that will be able to upgrade the contract, if a non-zero address.
     * @param __start Timestamp when vesting starts (seconds since UNIX epoch).
     * @param __cliff Duration of the cliff period (seconds). No tokens will vest before this time passes.
     * @param __duration Duration of the entire vesting period (seconds).
     */
    function initialize(
        address __beneficiary,
        address __admin,
        uint256 __start,
        uint256 __cliff,
        uint256 __duration
    ) external initializer {
        require(__beneficiary != address(0x0), "VestingWallet: beneficiary is zero address");
        require(__cliff <= __duration, "VestingWallet: duration is shorter than cliff");

        __Ownable_init();
        __UUPSUpgradeable_init();

        if (__admin == address(0)) {
            renounceOwnership();
        } else {
            transferOwnership(__admin);
        }

        _beneficiary = __beneficiary;
        _start = __start;
        _cliff = __cliff;
        _duration = __duration;
    }

    function beneficiary() public view virtual returns (address) {
        return _beneficiary;
    }

    function start() public view virtual returns (uint256) {
        return _start;
    }

    function cliff() public view virtual returns (uint256) {
        return _cliff;
    }

    function duration() public view virtual returns (uint256) {
        return _duration;
    }

    function released(address token) public view returns (uint256) {
        return _released[token];
    }

    /**
    * @dev Release the tokens that have vested by the specified timestamp.
    * WARNING: thoroughly review the token to be released code before executing.
    * @param token address of vested ERC20 tokens
    */
    function release(address token) public {
        uint256 releasable = Math.min(
            vestedAmount(token, block.timestamp) - released(token),
            IERC20(token).balanceOf(address(this))
        );
        _released[token] += releasable;
        emit TokensReleased(token, releasable);
        SafeERC20.safeTransfer(IERC20(token), beneficiary(), releasable);
    }

    /**
     * @dev Calculates the amount that has already vested in `timestamp`.
     * @param token address of vested ERC20 tokens.
     * @param timestamp date to check vesting schedule.
     * @return vested tokens.
     */
    function vestedAmount(address token, uint256 timestamp) public virtual view returns (uint256) {
        if (timestamp < start() + cliff()) {
            return 0;
        } else if (timestamp >= start() + duration()) {
            return _historicalBalance(token);
        } else {
            return _historicalBalance(token) * (timestamp - start()) / duration();
        }
    }

    /// Calculates the historical balance (current balance + already released balance).
    function _historicalBalance(address token) internal virtual view returns (uint256) {
        return IERC20(token).balanceOf(address(this)) + released(token);
    }

    /// Delegate voting right for `token` to `delegatee`
    function delegate(address token, address delegatee) public onlyBeneficiary() {
        ERC20Votes(token).delegate(delegatee);
    }

    /// Access control for the upgrade process
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyOwner() {}
}
