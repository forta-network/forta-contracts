// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Receiver.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "../../token/FortaBridgedPolygon.sol";
import "../../components/staking/FortaStaking.sol";
import "../../components/utils/ForwardedContext.sol";
import "../../components/staking/rewards/IRewardReceiver.sol";
import "../../errors/GeneralErrors.sol";

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

    error DontBridgeOrStakeRewards();
    
    /// Checks if _msgSender() is l2 manager, reverts if not.
    modifier onlyManager() {
        if (_msgSender() != l2manager) revert DoesNotHaveAccess(_msgSender(), "l2Manager");
        _;
    }

    /// Checks if `amount` is part of staking rewards, reverts so user don't bridge rewards back to VestingWallet and
    /// decelerates her vesting rate.
    modifier vestingBalance(uint256 amount) {
        if (l2token.balanceOf(address(this)) < amount + pendingReward) revert DontBridgeOrStakeRewards();
        _;
    }

    /**
     * @dev StakingEscrow is a MinimialProxyClone, so all clones will share this values.
     * @param __trustedForwarder address of meta-tx forwarder instance.
     * @param __token address of L2 bridged Forta contract.
     * @param __staking address of FortaStaking instance.
     */
    constructor(
        address      __trustedForwarder,
        FortaBridgedPolygon __token,
        FortaStaking __staking
    ) ForwardedContext(__trustedForwarder) initializer() {
        l2token   = __token;
        l2staking = __staking;
    }

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @dev Each different MinimialProxyClone instance of StakingEscrow can have different values
     * @param __l1vesting address of VestingWallet in L1, to bridge tokens to.
     * @param __l2manager admin address of StakingEscrow
     */
    function initialize(
        address __l1vesting,
        address __l2manager
    ) public initializer {
        if (__l1vesting == address(0)) revert ZeroAddress("__l1vesting");
        if (__l2manager == address(0)) revert ZeroAddress("__l2manager");
        l1vesting = __l1vesting;
        l2manager = __l2manager;
    }

    /**
     * @notice Staking operation: Relay `deposit` calls to the staking contract (with corresponding approval).
     * @dev Tokens gained as staking rewards cannot be staked here. They should be released to another account and staked there.
     * This contract will handle staking shares. Method restricted to wallet manager.
     * @param subjectType agents, scanner or future types of stake subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param stakeValue amount of staked token.
     * @return amount of ERC1155 active shares minted.
     */
    function deposit(uint8 subjectType, uint256 subject, uint256 stakeValue) public onlyManager() vestingBalance(stakeValue) returns (uint256) {
        IERC20(address(l2token)).approve(address(l2staking), stakeValue);
        uint256 shares = l2staking.deposit(subjectType, subject, stakeValue);
        // If staking over max, we could send less than stakeValue and have extra approval.
        IERC20(address(l2token)).approve(address(l2staking), 0);
        return shares;
    }

    /**
     * Overload: deposit everything
     * @param subjectType agents, scanner or future types of stake subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @return amount of shares minted.
     */
    function deposit(uint8 subjectType, uint256 subject) public returns (uint256) {
        return deposit(subjectType, subject, l2token.balanceOf(address(this)) - pendingReward);
    }

    /**
     * @notice Staking operation: Relay `initiateWithdrawal` calls to the staking contract.
     * @dev method restricted to l2Manager
     * @param subjectType agents, scanner or future types of stake subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @param sharesValue amount of shares token.
     */
    function initiateWithdrawal(uint8 subjectType, uint256 subject, uint256 sharesValue) public onlyManager() returns (uint64) {
        return l2staking.initiateWithdrawal(subjectType, subject, sharesValue);
    }

    /**
     * @notice Overload: initiate withdrawal of the full stake amount
     * @param subjectType agents, scanner or future types of stake subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     */
    function initiateWithdrawal(uint8 subjectType, uint256 subject) public returns (uint64) {
        return initiateWithdrawal(
            subjectType,
            subject,
            l2staking.sharesOf(subjectType, subject, address(this))
        );
    }

    /**
     * @notice Staking operation: Relay `withdrawal` calls to the staking contract.
     * @param subjectType agents, scanner or future types of stake subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     */
    function withdraw(uint8 subjectType, uint256 subject) public onlyManager() returns (uint256) {
        return l2staking.withdraw(subjectType, subject);
    }

    /**
     * @notice Staking operation: Relay `withdrawal` calls to the staking contract. Withdrawn balance will
     * go to StakingEscrow.
     * @dev anyone can call that directly on the staking contract. One should not assume rewards claims are done
     * through this relay function.
     * @param subjectType agents, scanner or future types of stake subject. See SubjectTypeValidator.sol
     * @param subject id identifying subject (external to FortaStaking).
     * @return released amount
     */
    function claimReward(uint8 subjectType, uint256 subject) public returns (uint256) {
        // TODO: adapt to new reward contract
        // return l2staking.releaseReward(subjectType, subject, address(this));
    }

    /**
     * @notice Release reward to any account chosen by the beneficiary. Rewards shouldn't be bridged back to prevent them
     * from being subject to vesting.
     * @dev In addition to releasing rewards, this function can also be used to release any other tokens that would be
     * sent to this escrow by mistake. This method will reduce the pending reward variable by `amount`.
     * @param releaseToken address of the ERC20 to transfer out of StakingEscrow.
     * @param receiver destination address.
     * @param amount of tokens to transfer.
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

    /**
     * @dev Override, release all rewards.
     */
    function releaseAllReward(address receiver) public {
        release(address(l2token), receiver, pendingReward);
    }

    /**
     * @notice Bridge operation: Send token back to the vesting instance on the parent chain (L1).
     * Any funds sent to the parent chain will be subject to the vesting schedule there. Consequently, rewards should
     * not be bridged back, but rather released to another wallet (and potentially bridged back independently).
     * @param amount of tokens to bridge.
     */
    function bridge(uint256 amount) public onlyManager() vestingBalance(amount) {
        if (amount == 0) revert ZeroAmount("amount");
        l2token.withdrawTo(amount, l1vesting);
    }

    /**
     * @dev Overload: bridge everything to L1
     */
    function bridge() public {
        bridge(l2token.balanceOf(address(this)) - pendingReward);
    }

    /**
     * @dev ERC165 implementation, needed for onRewardReceived.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, ERC1155Receiver) returns (bool) {
        return
            interfaceId == type(IRewardReceiver).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /**
     * @dev Hook for reward accounting
     */
    function onRewardReceived(uint8, uint256, uint256 amount) public {
        if (msg.sender != address(l2staking)) revert DoesNotHaveAccess(msg.sender, "l2staking");
        pendingReward += amount;
    }

    /// @dev implementation of ERC1155Receiver for single token transfers.
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external view returns (bytes4) {
        if (msg.sender != address(l2staking)) revert DoesNotHaveAccess(msg.sender, "l2staking");
        return this.onERC1155Received.selector;
    }

    /// @dev implementation of ERC1155Receiver for batch token transfers.
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external view returns (bytes4) {
        if (msg.sender != address(l2staking)) revert DoesNotHaveAccess(msg.sender, "l2staking");
        return this.onERC1155BatchReceived.selector;
    }
}
