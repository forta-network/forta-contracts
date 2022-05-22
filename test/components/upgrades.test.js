const { ethers, upgrades, network } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');

const prepareCommit = (...args) => ethers.utils.solidityKeccak256(['bytes32', 'address', 'string', 'uint256[]'], args);

let originalScanners, originalAgents;
describe('Upgrades testing', function () {
    prepare();

    describe('Agent Registry', async function () {
        it(' 0.1.1 -> 0.1.2', async function () {
            const AgentRegistry_0_1_1 = await ethers.getContractFactory('AgentRegistry_0_1_1');
            originalAgents = await upgrades.deployProxy(AgentRegistry_0_1_1, [this.contracts.access.address, this.contracts.router.address, 'Forta Agents', 'FAgents'], {
                kind: 'uups',
                constructorArgs: [this.contracts.forwarder.address],
                unsafeAllow: ['delegatecall'],
            });
            await originalAgents.deployed();

            //create agent
            const AGENT_ID = ethers.utils.hexlify(ethers.utils.randomBytes(32));
            const args = [AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5]];
            await originalAgents.prepareAgent(prepareCommit(...args));
            await network.provider.send('evm_increaseTime', [300]);
            await expect(originalAgents.connect(this.accounts.other).createAgent(...args));

            // Checks
            //expect(await this.agents.isCreated(AGENT_ID)).to.be.equal(true); //Does not exist in 0.1.1
            expect(await originalAgents.name()).to.be.equal('Forta Agents');
            expect(await originalAgents.symbol()).to.be.equal('FAgents');
            expect(await originalAgents.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
            expect(
                await originalAgents.getAgent(AGENT_ID).then((agent) => [agent.version.toNumber(), agent.metadata, agent.chainIds.map((chainId) => chainId.toNumber())])
            ).to.be.deep.equal([1, args[2], args[3]]);
            await originalAgents.connect(this.accounts.user1).enableAgent(AGENT_ID, 1);
            expect(await originalAgents.connect(this.accounts.user1).isEnabled(AGENT_ID)).to.be.equal(true);
            await originalAgents.connect(this.accounts.user1).disableAgent(AGENT_ID, 1);
            expect(await originalAgents.connect(this.accounts.user1).isEnabled(AGENT_ID)).to.be.equal(false);
            expect(await originalAgents.connect(this.accounts.user1).getAgentCount()).to.be.equal(1);
            const NewImplementation = await ethers.getContractFactory('AgentRegistry');
            const agentRegistry = await upgrades.upgradeProxy(originalAgents.address, NewImplementation, {
                call: {
                    fn: 'setStakeController(address)',
                    args: [this.contracts.stakingParameters.address],
                },
                constructorArgs: [this.contracts.forwarder.address],
                unsafeAllow: ['delegatecall'],
                unsafeSkipStorageCheck: true,
            });
            await this.contracts.stakingParameters.setStakeSubjectHandler(1, agentRegistry.address);
            await agentRegistry.connect(this.accounts.manager).setStakeThreshold({ max: '10000', min: '0', activated: true });
            expect(await agentRegistry.getStakeController()).to.be.equal(this.contracts.stakingParameters.address);
            expect(await agentRegistry.version()).to.be.equal('0.1.2');
            expect(await agentRegistry.isCreated(AGENT_ID)).to.be.equal(true);
            expect(await agentRegistry.connect(this.accounts.user1).isEnabled(AGENT_ID)).to.be.equal(false);
            await agentRegistry.connect(this.accounts.user1).enableAgent(AGENT_ID, 1);
            expect(await agentRegistry.connect(this.accounts.user1).isEnabled(AGENT_ID)).to.be.equal(true);
            expect(await agentRegistry.name()).to.be.equal('Forta Agents');
            expect(await agentRegistry.symbol()).to.be.equal('FAgents');
        });
    });

    describe('Scanner Registry', async function () {
        it(' 0.1.0 -> 0.1.1', async function () {
            this.accounts.getAccount('scanner');
            const ScannerRegistry_0_1_0 = await ethers.getContractFactory('ScannerRegistry_0_1_0');
            originalScanners = await upgrades.deployProxy(ScannerRegistry_0_1_0, [this.contracts.access.address, this.contracts.router.address, 'Forta Scanners', 'FScanners'], {
                kind: 'uups',
                constructorArgs: [this.contracts.forwarder.address],
                unsafeAllow: ['delegatecall'],
            });
            await originalScanners.deployed();

            const SCANNERS = [this.accounts.scanner, this.accounts.user1];

            var chainId = 1;
            for (var i = 0; i < SCANNERS.length; i++) {
                const scannerId = SCANNERS[i].address;
                await originalScanners.connect(SCANNERS[i]).register(this.accounts.user1.address, chainId);
                await originalScanners.connect(this.accounts.user1).setManager(scannerId, this.accounts.user2.address, true);
                await originalScanners.connect(this.accounts.manager).disableScanner(scannerId, 0);

                expect(await originalScanners.isEnabled(scannerId)).to.be.equal(false);
                expect(await originalScanners.isManager(scannerId, this.accounts.user2.address)).to.be.equal(true);
                expect(await originalScanners.getManagerCount(scannerId)).to.be.equal(1);
                expect(await originalScanners.getManagerAt(scannerId, 0)).to.be.equal(this.accounts.user2.address);

                expect(await originalScanners.getScanner(scannerId)).to.be.equal(chainId);
                // expect(await this.scanners.isRegistered(SCANNER_ID)).to.be.equal(true); Not existing in previous
                expect(await originalScanners.ownerOf(scannerId)).to.be.equal(this.accounts.user1.address);
                expect(await originalScanners.isEnabled(scannerId)).to.be.equal(false);
                chainId++;
            }
            chainId = 1;

            const NewImplementation = await ethers.getContractFactory('ScannerRegistry');
            const scannerRegistry = await upgrades.upgradeProxy(originalScanners.address, NewImplementation, {
                call: {
                    fn: 'setStakeController(address)',
                    args: [this.contracts.stakingParameters.address],
                },
                constructorArgs: [this.contracts.forwarder.address],
                unsafeAllow: ['delegatecall'],
                unsafeSkipStorageCheck: true,
            });
            await this.contracts.stakingParameters.setStakeSubjectHandler(0, scannerRegistry.address);
            await scannerRegistry.connect(this.accounts.manager).setStakeThreshold({ max: '100', min: '0', activated: true }, 1);

            await this.contracts.access.grantRole(this.roles.SCANNER_ADMIN, this.accounts.admin.address);
            for (const scanner of SCANNERS) {
                const scannerId = scanner.address;
                expect(await scannerRegistry.getStakeController()).to.be.equal(this.contracts.stakingParameters.address);
                expect(await scannerRegistry.version()).to.be.equal('0.1.1');
                expect(await scannerRegistry.isEnabled(scannerId)).to.be.equal(false);
                expect(await scannerRegistry.isManager(scannerId, this.accounts.user2.address)).to.be.equal(true);
                expect(await scannerRegistry.getManagerCount(scannerId)).to.be.equal(1);
                expect(await scannerRegistry.getManagerAt(scannerId, 0)).to.be.equal(this.accounts.user2.address);

                expect(await scannerRegistry.getScanner(scannerId).then((scanner) => [scanner.chainId.toNumber(), scanner.metadata])).to.be.deep.equal([chainId, '']);
                expect(await scannerRegistry.isRegistered(scannerId)).to.be.equal(true);
                expect(await scannerRegistry.ownerOf(scannerId)).to.be.equal(this.accounts.user1.address);
                expect(await scannerRegistry.isEnabled(scannerId)).to.be.equal(false);

                await scannerRegistry.connect(this.accounts.admin).adminUpdate(scannerId, 55, 'metadata');
                expect(await scannerRegistry.getScanner(scannerId).then((scanner) => [scanner.chainId.toNumber(), scanner.metadata])).to.be.deep.equal([55, 'metadata']);
                chainId++;
            }
        });
    });
});
