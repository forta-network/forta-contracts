//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "hardhat/console.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

abstract contract StateMachines {

    using EnumerableSet for EnumerableSet.UintSet;
    
    mapping(uint256 => uint256) private _machines; // Machine id --> currentstate
    mapping(uint256 => EnumerableSet.UintSet) private _states;
    uint256 public constant UNDEFINED_STATE = 0;

    event TransitionConfigured(uint256 indexed fromState, uint256 indexed toState);
    event StateTransition(uint256 indexed machineId, uint256 indexed fromState, uint256 indexed toState);

    modifier _onlyInState(uint256 _machineId, uint256 _state) {
        require(_state == _machines[_machineId], "Wrong state");
        _;
    }

    function _configureState(uint256 _state, uint256[] memory _nextStates) internal {
        for (uint256 i = 1; i < _nextStates.length; i++) {
            _states[_state].add(_nextStates[i]);
            emit TransitionConfigured(_state, _nextStates[i]);
        }
    }

    function _transitionTo(uint256 _machineId, uint256 _nextState) internal {
        require(_states[_machines[_machineId]].contains(_nextState), "nextState unreachable from current state");
        require(_canTransition(_machineId, _machines[_machineId], _nextState), "state transition forbidden");
        emit StateTransition(_machineId, _machines[_machineId], _nextState);
        _machines[_machineId] = _nextState;

    }

    function _requireState(uint256 _machineId, uint256 _state) internal view {
        require(_state == _machines[_machineId], "Wrong state");
    }

    function _canTransition(uint256 _machineId, uint256 _fromState, uint256 _toState) virtual internal returns(bool);

    function isInState(uint256 _machineId, uint256 _state) public view returns (bool) {
        return _machines[_machineId] == _state;
    }

}
