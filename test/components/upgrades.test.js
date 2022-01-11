const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');

const { upgradeImpl } = require('../../scripts/upgrade');

const prepareCommit = (...args)  => ethers.utils.solidityKeccak256([ 'bytes32', 'address', 'string', 'uint256[]' ], args);

let chainId;

describe('Upgrades testing', function () {
  prepare();
  before(async function() {
    const network = await ethers.provider.getNetwork();
    chainId = network.chainId;
  })
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
        console.log('script')
        /*const agentRegistry = await upgradeImpl(
            chainId,
            'agents',
            '0.1.2',
            {
                fn:'setMinStakeController(address)',
                args: [this.contracts.staking.address]
            },
            [ this.contracts.forwarder.address ],
            ['delegatecall']
        )*/
        

        //create agent
        const AGENT_ID = ethers.utils.hexlify(ethers.utils.randomBytes(32));
        const args = [ AGENT_ID, this.accounts.user1.address, 'Metadata1', [ 1 , 3, 4, 5 ] ];
        await agents_0_1_1.prepareAgent(prepareCommit(...args))
        await network.provider.send('evm_increaseTime', [ 300 ]);
        await expect(agents_0_1_1.connect(this.accounts.other).createAgent(...args))
        
        // Checks
        //expect(await this.agents.isCreated(AGENT_ID)).to.be.equal(true); //Does not exist in 0.1.1
        expect(await agents_0_1_1.name()).to.be.equal('Forta Agents');
        expect(await agents_0_1_1.symbol()).to.be.equal('FAgents'); 
        expect(await agents_0_1_1.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
        expect(await agents_0_1_1.getAgent(AGENT_ID).then(agent => [
          agent.version.toNumber(),
          agent.metadata,
          agent.chainIds.map(chainId => chainId.toNumber()),
        ])).to.be.deep.equal([
          1,
          args[2],
          args[3],
        ]);
        await agents_0_1_1.connect(this.accounts.user1).enableAgent(AGENT_ID, 1)
        expect(await agents_0_1_1.connect(this.accounts.user1).isEnabled(AGENT_ID)).to.be.equal(true)
        await agents_0_1_1.connect(this.accounts.user1).disableAgent(AGENT_ID, 1)
        expect(await agents_0_1_1.connect(this.accounts.user1).isEnabled(AGENT_ID)).to.be.equal(false)
        expect(await agents_0_1_1.connect(this.accounts.user1).getAgentCount()).to.be.equal(1)
        upgrades.silenceWarnings();

        const NewImplementation = await ethers.getContractFactory('AgentRegistry');
        const agentRegistry = await upgrades.upgradeProxy(
            agents_0_1_1.address,
            NewImplementation,
            {
                call: {
                    fn:'setStakeController(address)',
                    args: [this.contracts.staking.address]
                },
                constructorArgs: [ this.contracts.forwarder.address ],
                unsafeAllow: ['delegatecall']
            }
        );
        expect(await agentRegistry.getStakeController()).to.be.equal(this.contracts.staking.address)
        expect(await agentRegistry.version()).to.be.equal('0.1.2')
        expect(await agents_0_1_1.connect(this.accounts.user1).isEnabled(AGENT_ID)).to.be.equal(false)
        await agents_0_1_1.connect(this.accounts.user1).enableAgent(AGENT_ID, 1)
        expect(await agents_0_1_1.connect(this.accounts.user1).isEnabled(AGENT_ID)).to.be.equal(true)
        expect(await agents_0_1_1.name()).to.be.equal('Forta Agents');
        expect(await agents_0_1_1.symbol()).to.be.equal('FAgents'); 
    })
  })


  describe.only('Scanner Registry', async function() {
    it(' 0.1.0 -> 0.1.1', async function () {
        const ScannerRegistry_0_1_0 = await ethers.getContractFactory("ScannerRegistry_0_1_0");
        const scanners_0_1_1 = await upgrades.deployProxy(
            ScannerRegistry_0_1_0,
            [ this.contracts.access.address, this.contracts.router.address, 'Forta Scanners', 'FScanners' ],
            { 
                kind: 'uups',
                constructorArgs: [ this.contracts.forwarder.address ],
                unsafeAllow: ['delegatecall']
            }
        );
        await scanners_0_1_1.deployed();



        const NewImplementation = await ethers.getContractFactory('ScannerRegistry');
        const scannerRegistry = await upgrades.upgradeProxy(
            scanners_0_1_1.address,
            NewImplementation,
            {
                call: {
                    fn:'setStakeController(address)',
                    args: [this.contracts.staking.address]
                },
                constructorArgs: [ this.contracts.forwarder.address ],
                unsafeAllow: ['delegatecall']
            }
        );
        expect(await agentRegistry.getStakeController()).to.be.equal(this.contracts.staking.address)
        expect(await agentRegistry.version()).to.be.equal('0.1.1')

    })
  })
});
