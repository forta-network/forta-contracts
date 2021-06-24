// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/contracts/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/contracts/proxy/utils/UUPSUpgradeable.sol";

contract VestingWallet is OwnableUpgradeable, UUPSUpgradeable {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer
    {}

    mapping (address => uint256) private _released;
    address private _beneficiary;
    uint256 private _start;
    uint256 private _duration;

    event TokensReleased(address token, uint256 amount);

    modifier onlyBeneficiary() {
        require(beneficiary() == _msgSender(), "TokenVesting: access restricted to beneficiary");
        _;
    }

    function initialize(
        address beneficiary_,
        address admin_,
        uint256 start_,
        uint256 duration_
    ) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        if (admin_ == address(0)) {
            renounceOwnership();
        } else {
            transferOwnership(admin_);
        }

        _beneficiary = beneficiary_;
        _start = start_;
        _duration = duration_;
    }

    function beneficiary() public view virtual returns (address) {
        return _beneficiary;
    }

    function start() public view virtual returns (uint256) {
        return _start;
    }

    function duration() public view virtual returns (uint256) {
        return _duration;
    }

    function released(address token) public view returns (uint256) {
        return _released[token];
    }

    /**
    * @dev Release the tokens that have already vested.
    */
    function release(address token) public {
        uint256 releasable = vestedAmount(token, block.timestamp) - released(token);
        _released[token] += releasable;
        emit TokensReleased(token, releasable);
        SafeERC20.safeTransfer(IERC20(token), beneficiary(), releasable);
    }

    /**
     * @dev Calculates the amount that has already vested.
     */
    function vestedAmount(address token, uint256 timestamp) public virtual view returns (uint256) {
        if (timestamp < start()) {
            return 0;
        } else if (timestamp >= start() + duration()) {
            return _historicalBalance(token);
        } else {
            return _historicalBalance(token) * (timestamp - start()) / duration();
        }
    }

    /**
     * @dev Calculates the historical balance (current balance + already released balance).
     */
    function _historicalBalance(address token) private view returns (uint256) {
        return IERC20(token).balanceOf(address(this)) + released(token);
    }

    /**
     * @dev Delegate voting right
     */
    function delegate(address token, address delegatee) public onlyBeneficiary() {
        ERC20Votes(token).delegate(delegatee);
    }

    /**
     * Access control for the upgrade process
     */
    function _authorizeUpgrade(address newImplementation)
    internal virtual override onlyOwner()
    {}
}
