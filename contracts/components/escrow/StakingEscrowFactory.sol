// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./StakingEscrow.sol";
import "../BaseComponent.sol";

/**
 * @notice This contract must have the WHITELISTER_ROLE role on token
 */
contract StakingEscrowFactory is BaseComponent {
    FortaBridged  public immutable token;
    FortaStaking  public immutable staking;
    StakingEscrow public immutable template;

    constructor(
        address      __trustedForwarder,
        FortaStaking __staking
    ) initializer ForwardedContext(__trustedForwarder) {
        token   = FortaBridged(address(__staking.stakedToken()));
        staking = __staking;

        template = new StakingEscrow(
            __trustedForwarder,
            token,
            staking
        );
    }

    function initialize(
        address __manager,
        address __router
    ) public initializer {
        __AccessManaged_init(__manager);
        __Routed_init(__router);
        __UUPSUpgradeable_init();
    }

    function newWallet(
        address vesting,
        address beneficiary
    ) public onlyRole(BRIDGER_ROLE) returns (address) {
        address instance = Clones.cloneDeterministic(
            address(template),
            keccak256(abi.encodePacked(
                vesting,
                beneficiary
            ))
        );
        StakingEscrow(instance).initialize(vesting, beneficiary);
        token.grantRole(WHITELIST_ROLE, vesting); // necessary for withdrawals
        token.grantRole(WHITELIST_ROLE, instance);
        return instance;
    }
}
