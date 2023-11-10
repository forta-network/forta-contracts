// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "../BaseComponentUpgradeable.sol";

abstract contract ThreatOracleCore is BaseComponentUpgradeable {
    using EnumerableMap for EnumerableMap.AddressToUintMap;

    EnumerableMap.AddressToUintMap private _addressThreatLevel;

    event AddressThreatLevelSet(address indexed _address, uint256 indexed threatLevel);

    error IncorrectAmounts(uint256 addressAmount, uint256 threatLevelAmount);
    error ThreatLevelAlreadySet(address _address, uint256 threatLevel);

    function setThreatLevels(address[] calldata addresses, uint256[] calldata threatLevels) external onlyRole(THREAT_ORACLE_ADMIN_ROLE) {
        if (addresses.length != threatLevels.length) revert IncorrectAmounts(addresses.length, threatLevels.length);

        for (uint256 i = 0; i < addresses.length; i++) {
            _setThreatLevel(addresses[i], threatLevels[i]);
        }
    }

    function _setThreatLevel(address _address, uint256 threatLevel) private {
        if (getThreatLevel(_address) == threatLevel) revert ThreatLevelAlreadySet(_address, threatLevel);

        _addressThreatLevel.set(_address, threatLevel);
        emit AddressThreatLevelSet(_address, threatLevel);
    }

    function getThreatLevel(address _address) public view returns (uint) {
        return _addressThreatLevel.get(_address);
    }

    function isRegistered(address _address) public view returns (bool) {
        return _addressThreatLevel.contains(_address);
    }

    function totalAddressesRegistered() public view returns (uint256) {
        return _addressThreatLevel.length();
    }

    /**
     *  50
     * - 1 _addressThreatLevel
     * --------------------------
     *  49 __gap
     */
    uint256[49] private __gap;
}