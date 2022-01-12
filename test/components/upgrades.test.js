const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');

const { upgradeImpl } = require('../../scripts/upgrade');

const prepareCommit = (...args)  => ethers.utils.solidityKeccak256([ 'bytes32', 'address', 'string', 'uint256[]' ], args);

let chainId;
let originalScanners, originalAgents
describe('Upgrades testing', function () {
  prepare();
  before(async function() {
    const network = await ethers.provider.getNetwork();
    chainId = network.chainId;
    
  })
  
  describe('Agent Registry', async function() {
    it(' 0.1.1 -> 0.1.2', async function () {
        
        const AgentRegistry_0_1_1 = await ethers.getContractFactory("AgentRegistry_0_1_1");
        originalAgents = await upgrades.deployProxy(
            AgentRegistry_0_1_1,
            [ this.contracts.access.address, this.contracts.router.address, 'Forta Agents', 'FAgents' ],
            { 
                kind: 'uups',
                constructorArgs: [ this.contracts.forwarder.address ],
                unsafeAllow: ['delegatecall']
            }
        );
        await originalAgents.deployed();

        //create agent
        const AGENT_ID = ethers.utils.hexlify(ethers.utils.randomBytes(32));
        const args = [ AGENT_ID, this.accounts.user1.address, 'Metadata1', [ 1 , 3, 4, 5 ] ];
        await originalAgents.prepareAgent(prepareCommit(...args))
        await network.provider.send('evm_increaseTime', [ 300 ]);
        await expect(originalAgents.connect(this.accounts.other).createAgent(...args))
        
        // Checks
        //expect(await this.agents.isCreated(AGENT_ID)).to.be.equal(true); //Does not exist in 0.1.1
        expect(await originalAgents.name()).to.be.equal('Forta Agents');
        expect(await originalAgents.symbol()).to.be.equal('FAgents'); 
        expect(await originalAgents.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
        expect(await originalAgents.getAgent(AGENT_ID).then(agent => [
          agent.version.toNumber(),
          agent.metadata,
          agent.chainIds.map(chainId => chainId.toNumber()),
        ])).to.be.deep.equal([
          1,
          args[2],
          args[3],
        ]);
        await originalAgents.connect(this.accounts.user1).enableAgent(AGENT_ID, 1)
        expect(await originalAgents.connect(this.accounts.user1).isEnabled(AGENT_ID)).to.be.equal(true)
        await originalAgents.connect(this.accounts.user1).disableAgent(AGENT_ID, 1)
        expect(await originalAgents.connect(this.accounts.user1).isEnabled(AGENT_ID)).to.be.equal(false)
        expect(await originalAgents.connect(this.accounts.user1).getAgentCount()).to.be.equal(1)
        const NewImplementation = await ethers.getContractFactory('AgentRegistry');
        const agentRegistry = await upgrades.upgradeProxy(
            originalAgents.address,
            NewImplementation,
            {
                call: {
                    fn:'setStakeController(address)',
                    args: [this.contracts.staking.address]
                },
                constructorArgs: [ this.contracts.forwarder.address ],
                unsafeAllow: ['delegatecall'],
                unsafeSkipStorageCheck: true
            }
        );
        expect(await agentRegistry.getStakeController()).to.be.equal(this.contracts.staking.address)
        expect(await agentRegistry.version()).to.be.equal('0.1.2')
        expect(await agentRegistry.isCreated(AGENT_ID)).to.be.equal(true);
        expect(await agentRegistry.connect(this.accounts.user1).isEnabled(AGENT_ID)).to.be.equal(false)
        await agentRegistry.connect(this.accounts.user1).enableAgent(AGENT_ID, 1)
        expect(await agentRegistry.connect(this.accounts.user1).isEnabled(AGENT_ID)).to.be.equal(true)
        expect(await agentRegistry.name()).to.be.equal('Forta Agents');
        expect(await agentRegistry.symbol()).to.be.equal('FAgents'); 
    })
  })


  
  describe('Scanner Registry', async function() {
    it(' 0.1.0 -> 0.1.1', async function () {
        this.accounts.getAccount('scanner');
        const ScannerRegistry_0_1_0 = await ethers.getContractFactory("ScannerRegistry_0_1_0");
        originalScanners = await upgrades.deployProxy(
            ScannerRegistry_0_1_0,
            [ this.contracts.access.address, this.contracts.router.address, 'Forta Scanners', 'FScanners' ],
            { 
                kind: 'uups',
                constructorArgs: [ this.contracts.forwarder.address ],
                unsafeAllow: ['delegatecall']
            }
        );
        await originalScanners.deployed();

        const SCANNER_ID = this.accounts.scanner.address;

        await originalScanners.connect(this.accounts.scanner).register(this.accounts.user1.address, 1)
        await originalScanners.connect(this.accounts.user1).setManager(SCANNER_ID, this.accounts.user2.address, true)
        await originalScanners.connect(this.accounts.manager).disableScanner(SCANNER_ID, 0)

        expect(await originalScanners.isEnabled(SCANNER_ID)).to.be.equal(false);
        expect(await originalScanners.isManager(SCANNER_ID, this.accounts.user2.address)).to.be.equal(true);
        expect(await originalScanners.getManagerCount(SCANNER_ID)).to.be.equal(1);
        expect(await originalScanners.getManagerAt(SCANNER_ID, 0)).to.be.equal(this.accounts.user2.address);

        expect(await originalScanners.getScanner(SCANNER_ID)).to.be.equal(1);
        // expect(await this.scanners.isRegistered(SCANNER_ID)).to.be.equal(true); Not existing in previous
        expect(await originalScanners.ownerOf(SCANNER_ID)).to.be.equal(this.accounts.user1.address);
        expect(await originalScanners.isEnabled(SCANNER_ID)).to.be.equal(false);

        const NewImplementation = await ethers.getContractFactory('ScannerRegistry');
        const scannerRegistry = await upgrades.upgradeProxy(
            originalScanners.address,
            NewImplementation,
            {
                call: {
                    fn:'setStakeController(address)',
                    args: [this.contracts.staking.address]
                },
                constructorArgs: [ this.contracts.forwarder.address ],
                unsafeAllow: ['delegatecall'],
                unsafeSkipStorageCheck: true
            }
        );
        expect(await scannerRegistry.getStakeController()).to.be.equal(this.contracts.staking.address)
        expect(await scannerRegistry.version()).to.be.equal('0.1.1')
        expect(await scannerRegistry.isEnabled(SCANNER_ID)).to.be.equal(false);
        expect(await scannerRegistry.isManager(SCANNER_ID, this.accounts.user2.address)).to.be.equal(true);
        expect(await scannerRegistry.getManagerCount(SCANNER_ID)).to.be.equal(1);
        expect(await scannerRegistry.getManagerAt(SCANNER_ID, 0)).to.be.equal(this.accounts.user2.address);

        expect(await scannerRegistry.getScanner(SCANNER_ID)).to.be.equal(1);
        expect(await scannerRegistry.isRegistered(SCANNER_ID)).to.be.equal(true);
        expect(await scannerRegistry.ownerOf(SCANNER_ID)).to.be.equal(this.accounts.user1.address);
        expect(await scannerRegistry.isEnabled(SCANNER_ID)).to.be.equal(false);

    })
  })
});
