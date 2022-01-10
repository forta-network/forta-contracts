const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');


describe('Upgrades testing', function () {
  prepare();
  describe('Agent Registry', async function() {
    it(' 0.1.1 -> 0.1.2', async function () {
        const AgentRegistry_0_1_1 = await ethers.getContractFactory("AgentRegistry_0_1_1");
        const agents_0_1_1 = await upgrades.deployProxy(
            AgentRegistry_0_1_1,
            [ this.contracts.access.address, this.contracts.router.address, 'Forta Agents', 'FAgents' ],
            { 
                kind: 'uups',
                constructorArgs: [ this.contracts.forwarder.address ],
                unsafeAllow: ['delegatecall']
            }
        );
        await agents_0_1_1.deployed();
        console.log(this.contracts.staking.address)
        const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
        const agentRegistry = await upgrades.upgradeProxy(
            agents_0_1_1.address,
            AgentRegistry,
            {
                call: {
                    fn:'setMinStakeController(address)',
                    args: [this.contracts.staking.address]
                },
                constructorArgs: [ this.contracts.forwarder.address ],
                unsafeAllow: ['delegatecall']
            }
        );
        expect(await agentRegistry.getMinStakeController()).to.be.equal(this.contracts.staking.address)
        expect(await agentRegistry.version()).to.be.equal('1.1.2')

    })
  })
});
