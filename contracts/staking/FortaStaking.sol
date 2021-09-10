// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/utils/Timers.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";

import "../permissions/AccessManaged.sol";
import "../tools/Distributions.sol";
import "../tools/ENSReverseRegistration.sol";

contract FortaStaking is
    AccessManagedUpgradeable,
    ERC1155SupplyUpgradeable,
    // MulticallUpgradeable,
    UUPSUpgradeable
{
    using Distributions for Distributions.Balances;
    using Distributions for Distributions.SignedBalances;
    using Timers        for Timers.Timestamp;

    struct UnstakeRequest {
        Timers.Timestamp timestamp; // ← underlying time is uint64
        uint256 value; // TODO: use uint192 to save gas ?
    }

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant SLASHER_ROLE = keccak256("SLASHER_ROLE");

    IERC20 public stakedToken;

    // distribution of baseToken between subjects (address)
    Distributions.Balances private _stakes;
    Distributions.Balances private _rewards;

    // distribution of subject shares, with integrated reward splitting
    mapping(address => Distributions.SignedBalances) private _released;

    // unstakeRequests, in share token
    mapping(address => mapping(address => UnstakeRequest)) private _unstakeRequests;

    // unstake delay
    uint64 private _delay;

    // treasury for slashing
    address private _treasury;


    // TODO: define events
    // - stake → TransferSingle from address(0)
    // - unstake → TransferSingle to address(0)
    // - slashing → erc20 movement without share burn → might need a local event
    // - scheduleUnstake
    // - reward
    // - release
    // - setDelay
    // - setTreasury


    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    function initialize(
        address __manager,
        IERC20 __stakedToken,
        uint64 __delay,
        address __treasury
    ) public initializer {
        __AccessManaged_init(__manager);
        __UUPSUpgradeable_init();

        stakedToken = __stakedToken;
        _delay = __delay;
        _treasury = __treasury;
    }

    // Accessors
    function stakeOf(address subject) public view returns (uint256) {
        return _stakes.balanceOf(subject);
    }

    function totalStake() public view returns (uint256) {
        return _stakes.totalSupply();
    }

    function sharesOf(address subject, address account) public view returns (uint256) {
        return balanceOf(account, uint256(uint160(subject)));
    }

    function totalShares(address subject) public view returns (uint256) {
        return totalSupply(uint256(uint160(subject)));
    }

    // Stake related operations
    function stake(address subject, uint256 stakeValue) public returns (uint256) {
        address staker = _msgSender();

        uint256 sharesValue = totalSupply(uint256(uint160(subject))) == 0 ? stakeValue : _stakeToShares(subject, stakeValue);
        _deposit(subject, staker, stakeValue);
        _mint(staker, uint256(uint160(subject)), sharesValue, new bytes(0));
        return sharesValue;
    }

    function scheduleUnstake(address subject, uint256 sharesValue) public returns (uint64) {
        address staker = _msgSender();

        uint64 deadline = SafeCast.toUint64(block.timestamp) + _delay;
        uint256 value = Math.min(sharesValue, sharesOf(subject, staker));
        _unstakeRequests[subject][staker].timestamp.setDeadline(deadline);
        _unstakeRequests[subject][staker].value = value;
        return deadline;
    }

    function unstake(address subject, uint256 sharesValue) public returns (uint256) {
        address staker = _msgSender();

        if (_delay > 0) {
            require(_unstakeRequests[subject][staker].timestamp.isExpired());
            _unstakeRequests[subject][staker].value -= sharesValue; // schedule value is in shares, not in stake tokens
        }

        uint stakeValue = _sharesToStake(subject, sharesValue);
        _burn(staker, uint256(uint160(subject)), sharesValue);
        _withdraw(subject, staker, stakeValue);
        return stakeValue;
    }

    // function freeze
    // function unfreeze

    function slash(address subject, uint256 stakeValue) public onlyRole(SLASHER_ROLE) {
        _withdraw(subject, _treasury, stakeValue);
    }

    function reward(address subject, uint256 value) public {
        SafeERC20.safeTransferFrom(stakedToken, _msgSender(), address(this), value);
        _rewards.mint(subject, value);
    }

    function release(address subject, address account) public returns (uint256) {
        uint256 value = toRelease(subject, account);

        _rewards.burn(subject, value);
        _released[subject].mint(account, SafeCast.toInt256(value));

        SafeERC20.safeTransfer(stakedToken, account, value);
        return value;
    }

    function toRelease(address subject, address account) public view returns (uint256) {
        return SafeCast.toUint256(
            SafeCast.toInt256(_allocation(subject, balanceOf(account, uint256(uint160(subject)))))
            -
            _released[subject].balanceOf( account)
        );
    }

    // Internal helpers
    function _deposit(address subject, address provider, uint256 value) internal {
        SafeERC20.safeTransferFrom(stakedToken, provider, address(this), value);
        _stakes.mint(subject, value);
    }

    function _withdraw(address subject, address to, uint256 value) internal {
        _stakes.burn(subject, value);
        SafeERC20.safeTransfer(stakedToken, to, value);
    }

    function _stakeToShares(address subject, uint256 amount) internal view returns (uint256) {
        return amount * totalSupply(uint256(uint160(subject))) / _stakes.balanceOf(subject);
    }

    function _sharesToStake(address subject, uint256 amount) internal view returns (uint256) {
        return amount * _stakes.balanceOf(subject) / totalSupply(uint256(uint160(subject)));
    }

    function _historical(address subject) private view returns (uint256) {
        return SafeCast.toUint256(SafeCast.toInt256(_rewards.balanceOf(subject)) + _released[subject].totalSupply());
    }

    function _allocation(address subject, uint256 amount) private view returns (uint256) {
        uint256 supply = totalSupply(uint256(uint160(subject)));
        return amount > 0 && supply > 0 ? amount * _historical(subject) / supply : 0;
    }

    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal virtual override {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);

        for (uint256 i = 0; i < ids.length; ++i) {
            address subject = address(uint160(ids[i]));

            // Rebalance released
            int256 virtualRelease = SafeCast.toInt256(_allocation(subject, amounts[i]));
            if (from != address(0)) {
                _released[subject].burn(from, virtualRelease);
            }
            if (to != address(0)) {
                _released[subject].mint(to, virtualRelease);
            }

            // Cap commit to current balance
            uint256 pendingRelease = _unstakeRequests[subject][from].value;
            if (pendingRelease > 0) {
                uint256 currentShares = sharesOf(subject, from) - amounts[i];
                if (currentShares < pendingRelease) {
                    _unstakeRequests[subject][from].value = currentShares;
                }
            }
        }
    }

    // Admin: change unstake delay
    function setDelay(uint64 newDelay) public onlyRole(ADMIN_ROLE) {
        _delay = newDelay;
    }

    // Admin: change recipient of slashed funds
    function setTreasury(address newTreasury) public onlyRole(ADMIN_ROLE) {
        _treasury = newTreasury;
    }

    // Access control for the upgrade process
    function _authorizeUpgrade(address newImplementation) internal virtual override onlyRole(ADMIN_ROLE) {
    }

    // Allow the upgrader to set ENS reverse registration
    function setName(address ensRegistry, string calldata ensName) public onlyRole(ADMIN_ROLE) {
        ENSReverseRegistration.setName(ensRegistry, ensName);
    }
}