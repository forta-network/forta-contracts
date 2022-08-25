//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/**
 * Contract that allows for the creation and management of finite state machines.
 * The state machines will transition following a commonly defined state set.
 * What each state and state transition means, as well as the business logic of defining a valid transition
 * are left to the inheriting contract. StateMachine's mission is to ensure the machines transition within
 * the defined paths.
 * Machine identifiers are also left to the inheriting contracts, allowing for sequential ids or encoding
 * some business logic into them.
 */
abstract contract StateMachines {

    using EnumerableSet for EnumerableSet.UintSet;
    
    mapping(uint256 => uint256) private _machines; // Machine id --> currentstate
    mapping(uint256 => EnumerableSet.UintSet) private _states; // state --> reachableStates
    uint256 public constant UNDEFINED_STATE = 0;

    event MachineCreated(uint256 indexed machineId, uint256 initialState);
    event TransitionConfigured(uint256 indexed fromState, uint256 indexed toState);
    event StateTransition(uint256 indexed machineId, uint256 indexed fromState, uint256 indexed toState);

    error StateUnreachable(uint256 fromState, uint256 toState);
    error MachineAlreadyExists(uint256 machineId);
    error InvalidState(uint256 state);

    modifier onlyInState(uint256 _machineId, uint256 _state) {
        if (_state != _machines[_machineId]) revert InvalidState(_state);
        _;
    }

    /**
     * @notice Defines a state, and the next states a machine will be allowed to transtion to.
     * @dev The state definitions should be called in constructors or initializers. It is not recommended
     * to add or modify states and nextStates after initialization, since the machine logic can break.
     * There is no check for states defined in a way they are unreachable, the developer needs to map the 
     * correct state diagram
     * NOTE: for the correct functionality of the contract, id 0 is the UNDEFINED first state, needed to order
     * to check if a machine exists. A state transition from UNDEFINED to a first state must be defined.
     * @param _state the configured state id
     * @param _nextStates the state ids reachable from _state. This will be converted to a Set, so repeated state ids
     * will be ignored.
     */
    function _configureState(uint256 _state, uint256[] memory _nextStates) internal {
        for (uint256 i = 0; i < _nextStates.length; i++) {
            _states[_state].add(_nextStates[i]);
            emit TransitionConfigured(_state, _nextStates[i]);
        }
    }

    /**
     * Inits a state machine, in an initial state.
     * @param _machineId the identifier of a machine.
     * @param _initialState the initial state id of the machine. Must comply with configured state graph.
     */
    function _createMachine(uint256 _machineId, uint256 _initialState) internal {
        if (_initialState == UNDEFINED_STATE) revert InvalidState(_initialState);
        if (_machines[_machineId] != UNDEFINED_STATE) revert MachineAlreadyExists(_machineId);
        emit MachineCreated(_machineId, _initialState);
        _transitionTo(_machineId, _initialState);
    }

    /**
     * Transitions a state machine, from it's current state to _nextState
     * @param _machineId the identifier of a machine.
     * @param _nextState the initial state id of the machine. Must comply with configured state graph.
     */
    function _transitionTo(uint256 _machineId, uint256 _nextState) internal {
        if (!_states[_machines[_machineId]].contains(_nextState)) revert StateUnreachable(_machines[_machineId], _nextState);
        emit StateTransition(_machineId, _machines[_machineId], _nextState);
        _machines[_machineId] = _nextState;
    }

    /**
     * Checks if a machine is in the given _state
     * @param _machineId the identifier of a machine.
     * @param _state the initial state id of the machine.
     * @return true if the machine is in the given _state, false otherwise.
     */
    function isInState(uint256 _machineId, uint256 _state) public view returns (bool) {
        return _machines[_machineId] == _state;
    }

    /**
     * Checks the current state of a machine.
     * @param _machineId the identifier of a machine.
     * @return current state identifier.
     */
    function currentState(uint256 _machineId) public view returns (uint256) {
        return _machines[_machineId];
    }

    /**
     * Gets number of reachable states from _state.
     * @dev use for enumeration
     */
    function getRechableStatesNumber(uint256 _state) external view returns (uint256) {
        return _states[_state].length();
    }

    /**
     * Gets reachable state from _state at index.
     * @dev use for enumeration
     */
    function getReachableStateAt(uint256 _state, uint256 _index) external view returns (uint256) {
        return _states[_state].at(_index);
    }

    uint256[48] private __gap;

}
