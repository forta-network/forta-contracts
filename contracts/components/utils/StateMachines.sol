//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "hardhat/console.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

abstract contract StateMachines {

    using EnumerableSet for EnumerableSet.Bytes32Set;
    
    mapping(bytes32 => bytes32) private _currentStates;
    mapping(bytes32 => mapping(bytes32 => EnumerableSet.Bytes32Set)) private _states;
    bytes32 public constant DEFAULT_MACHINE = 0x00;

    event MachineInitialized(bytes32 indexed machine, bytes32 indexed initial);

    modifier _onlyInState(bytes32 _machine, bytes32 _state) {
        require(_state == _currentStates[_machine], "Wrong state");
        _;
    }

    function _addState(bytes32 _machine, bytes32 _state, bytes32[] memory _nextStates) internal {
        for (uint256 i = 1; i < _nextStates.length; i++) {
            _states[_machine][_state].add(_nextStates[i]);
        }
    }

    function _initMachine(bytes32 _machine, bytes32 _initialState) internal {
        require(_currentStates[_machine] == 0x00, "Machine already initialized");
        _currentStates[_machine] = _initialState;
        emit MachineInitialized(_machine, _initialState);
    }

    function _transitionTo(bytes32 _machine, bytes32 _nextState) internal {
        require(_states[_machine][_currentStates[_machine]].contains(_nextState), "nextState unreachable from current state");
        require(_canTransition(_machine, _currentStates[_machine], _nextState), "state transition forbidden");
        _currentStates[_machine] = _nextState;
    }

    function _requireState(bytes32 _machine, bytes32 _state) internal view {
        require(_state == _currentStates[_machine], "Wrong state");
    }

    function _canTransition(bytes32 _machine, bytes32 _fromState, bytes32 _toState) virtual internal returns(bool);

    function isInState(bytes32 _machine, bytes32 _state) public view returns (bool) {
        return _currentStates[_machine] == _state;
    }

}
