// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "../BaseComponentUpgradeable.sol";

abstract contract ThreatOracleCore is BaseComponentUpgradeable {
    using EnumerableMap for EnumerableMap.AddressToUintMap;

    /// Map of addresses to their corresponding threat level.
    EnumerableMap.AddressToUintMap private _addressThreatLevel;

    event AddressThreatLevelSet(address indexed _address, uint256 indexed threatLevel);

    error UnevenAmounts(uint256 addressAmount, uint256 threatLevelAmount);
    error ThreatLevelAlreadySet(address _address, uint256 threatLevel);

    /**
     * @notice Method to register addresses and assign them a threat level.
     * @dev Only accessible to the account that has admin access.
     * Does not allow setting the threat level to its current value.
     * Threat level is to be between 0-5.
     * @param addresses Array of addresses to register.
     * @param threatLevels Array of the addresses' corresponding threat levels.
     */
    function setThreatLevels(address[] calldata addresses, uint256[] calldata threatLevels) external onlyRole(THREAT_ORACLE_ADMIN_ROLE) {
        if (addresses.length != threatLevels.length) revert UnevenAmounts(addresses.length, threatLevels.length);

        for (uint256 i = 0; i < addresses.length; i++) {
            _setThreatLevel(addresses[i], threatLevels[i]);
        }
    }

    function _setThreatLevel(address _address, uint256 threatLevel) private {
        if (getThreatLevel(_address) == threatLevel) revert ThreatLevelAlreadySet(_address, threatLevel);

        _addressThreatLevel.set(_address, threatLevel);
        emit AddressThreatLevelSet(_address, threatLevel);
    }

    /**
     * @notice Get threat level for an address
     * @dev A return value of '0' does not mean an address is 'no threat',
     * as it could also mean it has not been registered.
     * @param _address Address of interest.
     * @return threat level of the given address.
     */
    function getThreatLevel(address _address) public view returns (uint256) {
        (,uint256 fetchedThreatLevel) = _addressThreatLevel.tryGet(_address);
        return fetchedThreatLevel;
    }

    /**
     * @notice Check if address has been registered.
     * @param _address Address of interest.
     * @return true if the address has been registered, false otherwise.
     */
    function isRegistered(address _address) public view returns (bool) {
        return _addressThreatLevel.contains(_address);
    }

    /**
     * @notice Gets the total amount of addresses that have been registered.
     * @dev Amount includes addresses deemed no threat.
     * @return amount of addresses that have been registered.
     */
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