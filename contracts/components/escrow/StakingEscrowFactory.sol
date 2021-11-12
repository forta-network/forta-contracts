// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./StakingEscrow.sol";
import "../BaseComponent.sol";

/**
 * @notice This contract must have the WHITELISTER_ROLE role on token
 */
contract StakingEscrowFactory is BaseComponent {
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    FortaBridged  public immutable token;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    FortaStaking  public immutable staking;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    StakingEscrow public immutable template;

    /// @custom:oz-upgrades-unsafe-allow constructor
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
