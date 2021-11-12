// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../token/FortaBridged.sol";
import "../staking/FortaStaking.sol";
import "../utils/ForwardedContext.sol";

contract StakingEscrow is Initializable, ForwardedContext {
    FortaBridged public immutable token;
    FortaStaking public immutable staking;
    address      public           vesting;
    address      public           beneficiary;

    modifier onlyBeneficiary() {
        require(_msgSender() == beneficiary, "restricted to beneficiary");
        _;
    }

    constructor(
        address      __trustedForwarder,
        FortaBridged __token,
        FortaStaking __staking
    ) ForwardedContext(__trustedForwarder) {
        token   = __token;
        staking = __staking;
    }

    function initialize(
        address __vesting,
        address __beneficiary
    ) public initializer {
        vesting = __vesting;
        beneficiary = __beneficiary;
    }

    function deposit(address subject, uint256 stakeValue) public onlyBeneficiary() returns (uint256) {
        SafeERC20.safeApprove(
            IERC20(address(token)),
            address(staking),
            stakeValue
        );
        return staking.deposit(subject, stakeValue);
    }

    function initiateWithdrawal(address subject, uint256 sharesValue) public onlyBeneficiary() returns (uint64) {
        return staking.initiateWithdrawal(subject, sharesValue);
    }

    function withdraw(address subject) public onlyBeneficiary() returns (uint256) {
        return staking.withdraw(subject);
    }

    function releaseReward(address subject) public returns (uint256) {
        return staking.releaseReward(subject, address(this));
    }

    function bridge(uint256 amount) public onlyBeneficiary() {
        token.withdrawTo(amount, vesting);
    }
}
