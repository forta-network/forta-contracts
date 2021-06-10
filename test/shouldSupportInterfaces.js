const { makeInterfaceId } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const INTERFACES = {
  ERC165: [
    'supportsInterface(bytes4)',
  ],
  ERC20: [
    'totalSupply()',
    'balanceOf(address)',
    'transfer(address,uint256)',
    'allowance(address,address)',
    'approve(address,uint256)',
    'transferFrom(address,address,uint256)',
  ],
  ERC20Metadata: [
    'name()',
    'symbol()',
    'decimals()',
  ],
  ERC20Permit: [
    'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)',
    'nonces(address)',
    'DOMAIN_SEPARATOR()',
  ],
  ERC20Votes: [
    'checkpoints(address,uint32)',
    'numCheckpoints(address)',
    'delegates(address)',
    'delegate(address)',
    'delegateBySig(address,uint256,uint256,uint8,bytes32,bytes32)',
    'getVotes(address)',
    'getPastVotes(address,uint256)',
    'getPastTotalSupply(uint256)',
  ],
  ERC20VotesComp: [
    'checkpoints(address,uint32)',
    'numCheckpoints(address)',
    'delegates(address)',
    'delegate(address)',
    'delegateBySig(address,uint256,uint256,uint8,bytes32,bytes32)',
    'getCurrentVotes(address)',
    'getPriorVotes(address,uint256)',
  ],
  AccessControl: [
    'hasRole(bytes32,address)',
    'getRoleAdmin(bytes32)',
    'grantRole(bytes32,address)',
    'revokeRole(bytes32,address)',
    'renounceRole(bytes32,address)',
  ],
};

const INTERFACE_IDS = {};
const FN_SIGNATURES = {};
for (const k of Object.getOwnPropertyNames(INTERFACES)) {
  INTERFACE_IDS[k] = makeInterfaceId.ERC165(INTERFACES[k]);
  for (const fnName of INTERFACES[k]) {
    // the interface id of a single function is equivalent to its function signature
    FN_SIGNATURES[fnName] = makeInterfaceId.ERC165([fnName]);
  }
}

function shouldSupportInterfaces (interfaces = []) {
  describe('Contract interface', function () {
    beforeEach(function () {
      this.contractUnderTest = this.mock || this.token || this.holder || this.accessControl;
    });

    for (const k of interfaces) {
      const interfaceId = INTERFACE_IDS[k];
      describe(k, function () {
        it('has to be implemented', function () {});
        describe('ERC165\'s supportsInterface(bytes4)', function () {
          it('uses less than 30k gas [skip-on-coverage]', async function () {
            expect(await this.contractUnderTest.estimateGas.supportsInterface(interfaceId)).to.be.lte(30000);
          });

          it('claims support', async function () {
            expect(await this.contractUnderTest.supportsInterface(interfaceId)).to.equal(true);
          });
        });

        for (const fnName of INTERFACES[k]) {
          describe(fnName, function () {
            it('has to be implemented', function () {
              expect(Object.keys(this.contractUnderTest.functions).filter(fn => fn == fnName).length).to.be.equal(1);
            });
          });
        }
      });
    }
  });
}

module.exports = {
  shouldSupportInterfaces,
};
