// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../BaseComponentUpgradeable.sol";
import "./ThreatOracleCore.sol";

/**
 * Onchain registry for accounts flagged by the Attack Detector bot. Each account registered will be assigned a set of 'threat properties',
 * which will include a category (e.g. 'exploit') and confidence score (0-100).
 * Only the account who has been granted the role of THREAT_ORACLE_ADMIN can register accounts.
 * Accounts that were added to the blocklist that were later discovered to have been false positives will be removed from the blocklist.
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