// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../token/FortaBridged.sol";
import "../staking/FortaStaking.sol";
import "../utils/ForwardedContext.sol";

contract StakingEscrow is IRewardReceiver, Initializable, ForwardedContext {
    FortaBridged public immutable token;
    FortaStaking public immutable staking;
    address      public           vesting;
    address      public           manager;
    uint256      public           pendingReward;

    modifier onlyManager() {
        require(_msgSender() == manager, "restricted to manager");
        _;
    }

    constructor(
        address      __trustedForwarder,
        FortaBridged __token,
        FortaStaking __staking
    ) ForwardedContext(__trustedForwarder) initializer() {
        token   = __token;
        staking = __staking;
    }

    function initialize(
        address __vesting,
        address __manager
    ) public initializer {
        vesting = __vesting;
        manager = __manager;
    }

    /**
     * Tunnel calls to the stacking contract.
     */
    function deposit(address subject, uint256 stakeValue) public onlyManager() returns (uint256) {
        SafeERC20.safeApprove(
            IERC20(address(token)),
            address(staking),
            stakeValue
        );
        return staking.deposit(subject, stakeValue);
    }
    function initiateWithdrawal(address subject, uint256 sharesValue) public onlyManager() returns (uint64) {
        return staking.initiateWithdrawal(subject, sharesValue);
    }

    function withdraw(address subject) public onlyManager() returns (uint256) {
        return staking.withdraw(subject);
    }

    function claimReward(address subject) public returns (uint256) {
        return staking.releaseReward(subject, address(this));
    }

    /**
     * Release reward to any account chossen by the beneficiary. Rewards shouldn't be bridged back to prevent them
     * from being subject to vesting.
     */
    function release(address releaseToken, address receiver, uint256 amount) public onlyManager() {
        if (address(token) == releaseToken) {
            pendingReward -= amount; // reverts is overflow;
        }

        SafeERC20.safeTransfer(
            IERC20(releaseToken),
            receiver,
            amount
        );
    }

    function releaseAllReward(address receiver) public {
        release(address(token), receiver, pendingReward);
    }

    /**
     * Bridge operation
     */
    function bridge(uint256 amount) public onlyManager() {
        require(token.balanceOf(address(this)) >= amount + pendingReward, "rewards should not be bridged to L1");
        token.withdrawTo(amount, vesting);
    }

    function bridge() public {
        bridge(token.balanceOf(address(this)) - pendingReward);
    }

    /**
     * Hook for reward accounting
     */
    function onRewardReceived(address, uint256 amount) public {
        require(msg.sender == address(staking));

        pendingReward += amount;
    }
}
