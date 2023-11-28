// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../../components/threat_oracle/ThreatOracleProvider.sol";

contract MockThreatOracleConsumer is ThreatOracleProvider {

    constructor(address _threatOracle, uint8 _minConfidenceScore, uint8 __maxAddressArgumentAmount)
        ThreatOracleProvider(_threatOracle, _minConfidenceScore, __maxAddressArgumentAmount)
    {}

    function foo() public view onlyNonThreatMsgSenderAndTxOrigin() returns (bool) {
        return true;
    }

    function bar(address _account)
        public
        view
        onlyNonThreatMsgSenderAndTxOrigin()
        onlyNonThreatAccount(_account)
        returns (bool)
    {
        return true;
    }

    function foobar(address _accountOne, address _accounTwo)
        public
        view
        onlyNonThreatMsgSenderAndTxOrigin()
        onlyNonThreatAccount(_accountOne)
        onlyNonThreatAccount(_accounTwo)
        returns (bool)
    {
        return true;
    }

    function foobarTwo(address[] memory _accountsOne, address[] calldata _accountsTwo)
        public
        view
        onlyNonThreatMsgSenderAndTxOrigin()
        onlyNonThreatAccounts(_accountsOne)
        onlyNonThreatAccounts(_accountsTwo)
        returns (bool)
    {
        return true;
    }

}