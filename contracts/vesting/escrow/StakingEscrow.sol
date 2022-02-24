// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Receiver.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "../../token/FortaBridgedPolygon.sol";
import "../../components/staking/FortaStaking.sol";
import "../../components/utils/ForwardedContext.sol";

/**
 * Logic for the escrow that handles vesting tokens, on the child chain, for a vesting wallet
 * on the parent chain. Instances are created as Minimal Proxy Clones.
 *
 * This contract contains some immutable parameters, common to all instances, that are set at
 * construction and some "normal" storage-based parameters that are instance specific and set
 * during initialization.
 * 
 * WARNING: DO NOT SEND FORT TOKENS TO THIS CONTRACT. It is designed only to handle bridged
 * tokens from `VestingWallet`, and the rewards that result from staking then in `FortaStaking`
 * If FORT tokens are sent to this contract, they can be bridged back to L1 VestingWallet,
 * but this process will slow down the release rate (not the dates, all FORT would be 
 * releaseble on vesting end).
 * If you have unvested tokens, interact directly with FortaStaking.
 */
contract StakingEscrow is Initializable, ERC165, IRewardReceiver, ForwardedContext, ERC1155Receiver {
    FortaBridgedPolygon public immutable l2token;
    FortaStaking public immutable l2staking;
    address      public           l1vesting;
    address      public           l2manager;
    uint256      public           pendingReward;

    modifier onlyManager() {
        require(_msgSender() == l2manager, "restricted to manager");
        _;
    }

    modifier vestingBalance(uint256 amount) {
        require(l2token.balanceOf(address(this)) >= amount + pendingReward, "rewards should not be bridged or staked");
        _;
    }

    constructor(
        address      __trustedForwarder,
        FortaBridgedPolygon __token,
        FortaStaking __staking
    ) ForwardedContext(__trustedForwarder) initializer() {
        l2token   = __token;
        l2staking = __staking;
    }

    function initialize(
        address __l1vesting,
        address __l2manager
    ) public initializer {
        require(__l1vesting != address(0), "StakingEscrow: __l1vesting cannot be address 0");
        require(__l2manager != address(0), "StakingEscrow: __l1vesting cannot be address 0");
        l1vesting = __l1vesting;
        l2manager = __l2manager;
    }

    /**
     * Staking operation: Relay `deposit` calls to the staking contract (with corresponding approval).
     *
     * Tokens gained as staking rewards cannot be staked here. They should be released to another account and staked
     * there.
     */
    function deposit(uint8 subjectType, uint256 subject, uint256 stakeValue) public onlyManager() vestingBalance(stakeValue) returns (uint256) {
        SafeERC20.safeApprove(
            IERC20(address(l2token)),
            address(l2staking),
            stakeValue
        );
        return l2staking.deposit(subjectType, subject, stakeValue);
    }

    /**
     * Overload: deposit everything
     */
    function deposit(uint8 subjectType, uint256 subject) public returns (uint256) {
        return deposit(subjectType, subject, l2token.balanceOf(address(this)) - pendingReward);
    }

    /**
     * Staking operation: Relay `initiateWithdrawal` calls to the staking contract.
     */
    function initiateWithdrawal(uint8 subjectType, uint256 subject, uint256 sharesValue) public onlyManager() returns (uint64) {
        return l2staking.initiateWithdrawal(subjectType, subject, sharesValue);
    }

    /**
     * Overload: initiate withdrawal of the full stake amount
     */
    function initiateFullWithdrawal(uint8 subjectType, uint256 subject) public returns (uint64) {
        return initiateWithdrawal(
            subjectType,
            subject,
            l2staking.sharesOf(subjectType, subject, address(this))
        );
    }

    /**
     * Staking operation: Relay `withdrawal` calls to the staking contract.
     */
    function withdraw(uint8 subjectType, uint256 subject) public onlyManager() returns (uint256) {
        return l2staking.withdraw(subjectType, subject);
    }

    /**
     * Staking operation: Relay `withdrawal` calls to the staking contract.
     *
     * Note: anyone can call that directly on the staking contract. One should not assume rewards claims are done
     * through this relay function.
     */
    function claimReward(uint8 subjectType, uint256 subject) public returns (uint256) {
        return l2staking.releaseReward(subjectType, subject, address(this));
    }

    /**
     * Release reward to any account chosen by the beneficiary. Rewards shouldn't be bridged back to prevent them
     * from being subject to vesting.
     *
     * In addition to releasing rewards, this function can also be used to release any other tokens that would be
     * sent to this escrow by mistake.
     */
    function release(address releaseToken, address receiver, uint256 amount) public onlyManager() {
        if (address(l2token) == releaseToken) {
            pendingReward -= amount; // reverts on overflow;
        }

        SafeERC20.safeTransfer(
            IERC20(releaseToken),
            receiver,
            amount
        );
    }

    function releaseAllReward(address receiver) public {
        release(address(l2token), receiver, pendingReward);
    }

    /**
     * Bridge operation: Send token back to the vesting instance on the parent chain.
     *
     * Any funds sent to the parent chain will be subject to the vesting schedule there. Consequently, rewards should
     * not be bridged back, but rather released to another wallet (and potentially bridged back independently).
     */
    function bridge(uint256 amount) public onlyManager() vestingBalance(amount) {
        require(amount > 0, "StakingEscrow: amount must be > 0");
        l2token.withdrawTo(amount, l1vesting);
    }

    /**
     * Overload: bridge everything
     */
    function bridge() public {
        bridge(l2token.balanceOf(address(this)) - pendingReward);
    }

    /**
     * ERC165 implementation, needed for onRewardReceived.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, ERC1155Receiver) returns (bool) {
        return
            interfaceId == type(IRewardReceiver).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /**
     * Hook for reward accounting
     */
    function onRewardReceived(uint8, uint256, uint256 amount) public {
        require(msg.sender == address(l2staking), "StakingEscrow: sender must be l2staking");
        pendingReward += amount;
    }

    /**
     * This account is going to hold staking shares
     */
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external view returns (bytes4) {
        require(msg.sender == address(l2staking), "StakingEscrow: sender must be l2staking");
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external view returns (bytes4) {
        require(msg.sender == address(l2staking), "StakingEscrow: sender must be l2staking");
        return this.onERC1155BatchReceived.selector;
    }
}
