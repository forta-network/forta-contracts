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

    mapping (address => uint256) private __released;
    address private __beneficiary;
    uint256 private __start;
    uint256 private __cliff;
    uint256 private __duration;

    event TokensReleased(address token, uint256 amount);

    modifier onlyBeneficiary() {
        require(beneficiary() == _msgSender(), "VestingWallet: access restricted to beneficiary");
        _;
    }

    function initialize(
        address _beneficiary,
        address _admin,
        uint256 _start,
        uint256 _cliff,
        uint256 _duration
    ) external initializer {
        require(_beneficiary != address(0x0), "VestingWallet: beneficiary is zero address");
        require(_start <= _cliff, "VestingWallet: cliff is before start");
        require(_cliff <= _cliff + _duration, "VestingWallet: cliff is after end");

        __Ownable_init();
        __UUPSUpgradeable_init();

        if (_admin == address(0)) {
            renounceOwnership();
        } else {
            transferOwnership(_admin);
        }

        __beneficiary = _beneficiary;
        __start = _start;
        __cliff = _cliff;
        __duration = _duration;
    }

    function beneficiary() public view virtual returns (address) {
        return __beneficiary;
    }

    function start() public view virtual returns (uint256) {
        return __start;
    }

    function cliff() public view virtual returns (uint256) {
        return __cliff;
    }

    function duration() public view virtual returns (uint256) {
        return __duration;
    }

    function released(address token) public view returns (uint256) {
        return __released[token];
    }

    /**
    * @dev Release the tokens that have vested by the specified timestamp.
    */
    function release(address token) public {
        uint256 releasable = vestedAmount(token, block.timestamp) - released(token);
        __released[token] += releasable;
        emit TokensReleased(token, releasable);
        SafeERC20.safeTransfer(IERC20(token), beneficiary(), releasable);
    }

    /**
     * @dev Calculates the amount that has already vested.
     */
    function vestedAmount(address token, uint256 timestamp) public virtual view returns (uint256) {
        if (timestamp < cliff()) {
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
