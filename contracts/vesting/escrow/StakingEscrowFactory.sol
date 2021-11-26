// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./StakingEscrow.sol";
import "./StakingEscrowUtils.sol";

/**
 * @notice This contract must have the WHITELISTER_ROLE role on token
 */
contract StakingEscrowFactory {
    FortaBridged  public immutable token;
    FortaStaking  public immutable staking;
    StakingEscrow public immutable template;

    event NewStakingEscrow(address indexed escrow, address indexed vesting, address indexed manager);

    constructor(address __trustedForwarder, FortaStaking __staking) {
        token   = FortaBridged(address(__staking.stakedToken()));
        staking = __staking;

        template = new StakingEscrow(
            __trustedForwarder,
            token,
            staking
        );
    }

    function newWallet(
        address vesting,
        address manager
    ) public returns (address) {
        address instance = Clones.cloneDeterministic(
            address(template),
            StakingEscrowUtils.computeSalt(vesting, manager)
        );
        StakingEscrow(instance).initialize(vesting, manager);
        token.grantRole(WHITELIST_ROLE, instance);

        emit NewStakingEscrow(instance, vesting, manager);

        return instance;
    }

    function predictWallet(
        address vesting,
        address manager
    ) public view returns (address) {
        return Clones.predictDeterministicAddress(
            address(template),
            StakingEscrowUtils.computeSalt(vesting, manager)
        );
    }
}
