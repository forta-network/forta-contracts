// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./StakingEscrow.sol";
import "./StakingEscrowUtils.sol";
import "../../errors/GeneralErrors.sol";


/**
 * Factory in charge of creating escrow instances for the vesting wallets. This factory, and the escrow instances are
 * on the child chain, where the staking contract exist. The vesting wallets are back on the parent chain, where they
 * are supervising vesting allocations.
 *
 * This is a trustless, non upgradeable contract. Anyone can create an escrow instance for a vesting wallet. The
 * escrow instance is automatically whitelisted on the forta token (on the child chain), but the manager isn't
 * (to avoid whitelist abuse). The manager will not handle tokens anyway. Manager can be the beneficiary of the
 * vesting wallet, or any other address. It has to be an address valid on the child chain.
 *
 * Anyone can instantiate an escrow for any vesting contract with any manager. It is ultimately the vesting
 * beneficiary that decide which manager to use when bridging token from the parent chain to the child chain.
 * The manager is the address of an EOA, or a smart wallet on the child chain, that will be the only one authorized
 * to operate on the escrow (see the {StakingEscrow}).
 *
 * Escrow instantiation uses create2 so that they can be deterministically predicted (in particular, by the vesting
 * wallet on the parent chain).
 *
 * @notice This contract must have the WHITELISTER_ROLE role on token
 */
contract StakingEscrowFactory {
    FortaBridgedPolygon  public immutable token;
    FortaStaking  public immutable staking;
    address public immutable template;

    event NewStakingEscrow(address indexed escrow, address indexed vesting, address indexed manager);

    constructor(address __trustedForwarder, FortaStaking __staking) {
        if (__trustedForwarder == address(0)) revert ZeroAddress("__trustedForwarder");
        token    = FortaBridgedPolygon(address(__staking.stakedToken()));
        staking  = __staking;
        template = address(new StakingEscrow(
            __trustedForwarder,
            token,
            staking
        ));
    }

    /**
     * Deterministically deploys new instance of StakingEscrow as a Minimal Proxy Clone, whitelisting it for
     * FortaBridgedPolygon token transfer
     * @param vesting address for associated L1 VestingWallet. StakingEscrow will bridge back to this.
     * @param manager address that will be l2Manager in StakingEscrow
     * @return address of the deployed StakingEscrow
     */
    function newWallet(
        address vesting,
        address manager
    ) public returns (address) {
        if (vesting == address(0)) revert ZeroAddress("vesting");
        if (manager == address(0)) revert ZeroAddress("manager");
        address instance = Clones.cloneDeterministic(
            template,
            StakingEscrowUtils.computeSalt(vesting, manager)
        );
        StakingEscrow(instance).initialize(vesting, manager);
        token.grantRole(token.WHITELIST_ROLE(), instance);

        emit NewStakingEscrow(instance, vesting, manager);

        return instance;
    }

    /**
     * Deterministically infers address of new instance of StakingEscrow without deploying
     * @param vesting address for associated L1 VestingWallet. StakingEscrow will bridge back to this.
     * @param manager address that will be l2Manager in StakingEscrow
     * @return address of the StakingEscrow
     */
    function predictWallet(
        address vesting,
        address manager
    ) public view returns (address) {
        return Clones.predictDeterministicAddress(
            template,
            StakingEscrowUtils.computeSalt(vesting, manager)
        );
    }
}
