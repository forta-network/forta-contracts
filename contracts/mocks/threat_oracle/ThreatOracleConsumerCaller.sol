// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

interface IMockThreatOracleConsumer {
    function foo() external view returns (bool);
    function bar(address _account) external view returns (bool);
    function foobar(address _accountOne, address _accounTwo) external view returns (bool);
    function foobarTwo(address[] memory _accountsOne, address[] calldata _accountsTwo) external view returns (bool);
}

contract ThreatOracleConsumerCaller {
    
    function callFoo(address _threatOracleConsumer) public view returns (bool) {
        bool success = IMockThreatOracleConsumer(_threatOracleConsumer).foo();
        return success;
    }
}