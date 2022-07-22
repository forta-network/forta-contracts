// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-protocol/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.4;

import "../BaseComponentUpgradeable.sol";
import "./SubjectTypes.sol";
import "../utils/StateMachines.sol";
import "../../errors/GeneralErrors.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract SlashingController is BaseComponentUpgradeable, StateMachines, SubjectTypeValidator {

    using Counters for Counters.Counter;

    enum SlashStates {
        UNDEFINED,
        CREATED,
        REJECTED,
        DISMISSED,
        ACCEPTED,
        EXECUTED,
        REVERTED
    }

    enum SlashReasons {
        OPERATIONAL,
        MALICIOUS
    }

    struct Proposal {
        string evidence;
        uint256 subjectId;
        SlashReasons reason;
        uint8 subjectType;
    }

    Counters.Counter private _proposalIds;
    string public constant version = "0.1.0";

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     * @param __router address of Router.
     */
    function initialize(
        address __manager,
        address __router
    ) public initializer {
        __AccessManaged_init(__manager);
        __Routed_init(__router);
        __UUPSUpgradeable_init();

        // UNDEFINED --> CREATED
        uint256[] memory afterUndefined = new uint256[](1);
        afterUndefined[0] = uint256(SlashStates.CREATED);
        _configureState(uint256(SlashStates.UNDEFINED), afterUndefined);

        // CREATED --> DISMISSED, REJECTED or ACCEPTED
        uint256[] memory afterCreated = new uint256[](3);
        afterCreated[0] = uint256(SlashStates.DISMISSED);
        afterCreated[1] = uint256(SlashStates.REJECTED);
        afterCreated[2] = uint256(SlashStates.ACCEPTED);
        _configureState(uint256(SlashStates.CREATED), afterCreated);

        // ACCEPTED --> EXECUTED or REVERTED
        uint256[] memory afterAccepted = new uint256[](2);
        afterAccepted[0] = uint256(SlashStates.EXECUTED);
        afterAccepted[1] = uint256(SlashStates.REVERTED);
        _configureState(uint256(SlashStates.ACCEPTED), afterAccepted);
    }

    function proposeSlash() external {

    }



    function _canTransition(uint256 _machineId, uint256 _fromState, uint256 _toState) virtual override internal returns(bool) {
        return false;
    }
   
}