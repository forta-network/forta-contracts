// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../../components/threat_oracle/ThreatOracleProvider.sol";

contract MockThreatOracleConsumer is ThreatOracleProvider {

    constructor(address __threatOracle) ThreatOracleProvider(__threatOracle) {}

    function foo() public view onlyNonExploitAccount(msg.sender) onlyNonExploitAccount(tx.origin) returns (bool) {
        return true;
    }

    function bar(address _account)
        public
        view
        onlyNonExploitAccount(msg.sender)
        onlyNonExploitAccount(tx.origin)
        onlyNonExploitAccount(_account)
        returns (bool)
    {
        return true;
    }
}