//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

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
        if (_state == _machines[_machineId]) revert InvalidState(_state);
        _;
    }

    function _configureState(uint256 _state, uint256[] memory _nextStates) internal {
        for (uint256 i = 0; i < _nextStates.length; i++) {
            _states[_state].add(_nextStates[i]);
            emit TransitionConfigured(_state, _nextStates[i]);
        }
    }

    function _createMachine(uint256 _machineId, uint256 _initialState) internal {
        if (_initialState == UNDEFINED_STATE) revert InvalidState(_initialState);
        if (_machines[_machineId] != UNDEFINED_STATE) revert MachineAlreadyExists(_machineId);
        emit MachineCreated(_machineId, _initialState);
        _transitionTo(_machineId, _initialState);
    }

    function _transitionTo(uint256 _machineId, uint256 _nextState) internal {
        if (!_states[_machines[_machineId]].contains(_nextState)) revert StateUnreachable(_machines[_machineId], _nextState);
        emit StateTransition(_machineId, _machines[_machineId], _nextState);
        _machines[_machineId] = _nextState;
    }

    function isInState(uint256 _machineId, uint256 _state) public view returns (bool) {
        return _machines[_machineId] == _state;
    }

}
