// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./StakingEscrow.sol";
import "./StakingEscrowUtils.sol";

/**
 * Factory in charge of creating escrow instances for the vesting wallets. This factory, and the escrow instances are
 * on the child chain, where the staking contract exist. The vesting wallets are back on the parent chain, where they
 * are supervising vesting allocations.
 *
 * This is a trustless, non upgradeable contract. Anyone can create an escrow instance for a vesting wallet. The
 * escrow instance is automatically whitelisted on the forta token (on the child chain), but the manager isn't
 * (to avoid whitelist abuse). The manager will not handle tokens anyway. Manager can be the beneficiary of the
 * vesting wallet, or any other address. It as to be an address valid on the child chain.
 *
 * Anyone can instanciate an escrow for any vesting contract with any manager. It is ultimatelly the vesting
 * beneficiary that decide which manager to use when bridging token from the parent chain to the child chain.
 * The manager is the address of an EOA, or a smart wallet on the child chain, that will be the only one authorized
 * to operate on the escrow (see the {StakingEscrow}).
 *
 * Escrow instanciation uses create2 so that they can be deterministically predicted (in particular, by the vesting
 * wallet on the parent chain).
 *
 * @notice This contract must have the WHITELISTER_ROLE role on token
 */
contract StakingEscrowFactory {
    FortaBridged  public immutable token;
    FortaStaking  public immutable staking;
    StakingEscrow public immutable template;

    event NewStakingEscrow(address indexed escrow, address indexed vesting, address indexed manager);

    constructor(address __trustedForwarder, FortaStaking __staking) {
        token    = FortaBridged(address(__staking.stakedToken()));
        staking  = __staking;
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
