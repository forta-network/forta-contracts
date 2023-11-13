// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../BaseComponentUpgradeable.sol";
import "./ThreatOracleCore.sol";

/**
 * Onchain registry for addresses flagged by the Attack Detector bot. Each address registered will be assigned a 'threat level', which will be a value
 * between 0-5. Only the account who has been granted the role of THREAT_ORACLE_ADMIN can register addresses.
 * Addresses that were initially given a non-zero threat level that were later discovered to have been false positives will be updated to have their
 * threat level set to zero.
 */
contract ThreatOracle is BaseComponentUpgradeable, ThreatOracleCore {
    string public constant version = "0.1.0";
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address forwarder) initializer ForwardedContext(forwarder) {}

    /**
     * @notice Initializer method, access point to initialize inheritance tree.
     * @param __manager address of AccessManager.
     */
    function initialize(
        address __manager
    ) public initializer {
        __BaseComponentUpgradeable_init(__manager);
    }

    uint256[50] private __gap;
}