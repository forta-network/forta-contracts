const { ethers, network } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const { prepare } = require('../fixture');

const AGENT_ID = ethers.utils.hexlify(ethers.utils.randomBytes(32));
const redundancy = 6;
const shards = 10;

// Also passed to SubscriptionManager
// during deployment in platform.js
const individualLockPlanBotUnits = 300;
const teamLockPlanBotUnits = 500;

const prepareCommit = (...args) => ethers.utils.solidityKeccak256(['bytes32', 'address', 'string', 'uint256[]', 'uint8', 'uint8'], args);

describe('Agent Registry', function () {
    prepare({ stake: { agents: { min: '100', max: '500', activated: true } } });

    describe('create and update', function () {
        it('missing prepare if delay set', async function () {
            const args = [AGENT_ID, 'Metadata1', [1, 3, 4, 5], redundancy, shards];
            await expect(this.agents.connect(this.accounts.manager).setFrontRunningDelay('1800'))
                .to.emit(this.agents, 'FrontRunningDelaySet')
                .withArgs(ethers.BigNumber.from('1800'));
            await expect(this.agents.connect(this.accounts.user1).registerAgent(...args)).to.be.revertedWith('CommitNotReady()');
        });

        describe('with prepare', async function () {
            it('early', async function () {
                const args = [AGENT_ID, 'Metadata1', [1, 3, 4, 5], redundancy, shards];
                const argsToHash = [args[0], this.accounts.user1.address, args[1], args[2], args[3], args[4]];
                await expect(this.agents.connect(this.accounts.manager).setFrontRunningDelay('1800'))
                    .to.emit(this.agents, 'FrontRunningDelaySet')
                    .withArgs(ethers.BigNumber.from('1800'));

                await this.agents.prepareAgent(prepareCommit(...argsToHash));

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args)).to.be.revertedWith('CommitNotReady()');
            });

            it('non existing agent', async function () {
                expect(
                    await this.agents
                        .getAgent(AGENT_ID)
                        .then((agent) => [agent.owner, agent.agentVersion.toNumber(), agent.metadata, agent.chainIds.map((chainId) => chainId.toNumber()), agent.redundancy, agent.shards])
                ).to.be.deep.equal([ethers.constants.AddressZero, 0, '', [], 0, 0]);
            });

            it('no delay - individual Lock plan', async function () {
                const args = [AGENT_ID, 'Metadata1', [1, 3, 4, 5], redundancy, shards];
                const individualKeyPrice = await this.individualLock.keyPrice();

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                const txnReceipt = await this.individualLock.connect(this.accounts.user1).purchase(
                    [individualKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );
                await txnReceipt.wait();

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args))
                    .to.emit(this.agents, 'Transfer')
                    .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5], redundancy, shards);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4, 5].length * redundancy * shards);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits - ([1, 3, 4, 5].length * redundancy * shards));
            });

            it('no delay - team Lock plan', async function () {
                const args = [AGENT_ID, 'Metadata1', [1, 3, 4, 5], redundancy, shards];
                const teamKeyPrice = await this.teamLock.keyPrice();

                expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                const txnReceipt = await this.teamLock.connect(this.accounts.user1).purchase(
                    [teamKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );
                await txnReceipt.wait();

                expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args))
                    .to.emit(this.agents, 'Transfer')
                    .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5], redundancy, shards);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4, 5].length * redundancy * shards);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits - ([1, 3, 4, 5].length * redundancy * shards));
            });

            it('on time - individual Lock plan', async function () {
                const args = [AGENT_ID, 'Metadata1', [1, 3, 4, 5], redundancy, shards];
                const argsToHash = [args[0], this.accounts.user1.address, args[1], args[2], args[3], args[4]];
                const individualKeyPrice = await this.individualLock.keyPrice();

                expect(await this.agents.getAgentCount()).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('0');
                await expect(this.agents.connect(this.accounts.manager).setFrontRunningDelay('100'))
                    .to.emit(this.agents, 'FrontRunningDelaySet')
                    .withArgs(ethers.BigNumber.from('100'));

                const { blockNumber } = await this.agents.prepareAgent(prepareCommit(...argsToHash));
                const { timestamp } = await ethers.provider.getBlock(blockNumber);

                expect(await this.agents.getCommitTimestamp(prepareCommit(...argsToHash))).to.be.equal(timestamp);

                await network.provider.send('evm_increaseTime', [300]);

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                const txnReceipt = await this.individualLock.connect(this.accounts.user1).purchase(
                    [individualKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );
                await txnReceipt.wait();

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args))
                    .to.emit(this.agents, 'Transfer')
                    .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5], redundancy, shards);
                expect(await this.agents.isRegistered(AGENT_ID)).to.be.equal(true);
                expect(await this.agents.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
                expect(
                    await this.agents
                        .getAgent(AGENT_ID)
                        .then((agent) => [agent.owner, agent.agentVersion.toNumber(), agent.metadata, agent.chainIds.map((chainId) => chainId.toNumber()), agent.redundancy, agent.shards])
                ).to.be.deep.equal([this.accounts.user1.address, 1, args[1], args[2], args[3], args[4]]);
                expect(await this.agents.getAgentCount()).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('1');
                expect(await this.agents.getAgentByIndex(0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(1, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(3, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(4, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(5, 0)).to.be.equal(AGENT_ID);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4, 5].length * redundancy * shards);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits - ([1, 3, 4, 5].length * redundancy * shards));
            });

            it('on time - team Lock plan', async function () {
                const args = [AGENT_ID, 'Metadata1', [1, 3, 4, 5], redundancy, shards];
                const argsToHash = [args[0], this.accounts.user1.address, args[1], args[2], args[3], args[4]];
                const teamKeyPrice = await this.teamLock.keyPrice();

                expect(await this.agents.getAgentCount()).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('0');
                await expect(this.agents.connect(this.accounts.manager).setFrontRunningDelay('100'))
                    .to.emit(this.agents, 'FrontRunningDelaySet')
                    .withArgs(ethers.BigNumber.from('100'));

                const { blockNumber } = await this.agents.prepareAgent(prepareCommit(...argsToHash));
                const { timestamp } = await ethers.provider.getBlock(blockNumber);

                expect(await this.agents.getCommitTimestamp(prepareCommit(...argsToHash))).to.be.equal(timestamp);

                await network.provider.send('evm_increaseTime', [300]);

                expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                const txnReceipt = await this.teamLock.connect(this.accounts.user1).purchase(
                    [teamKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );
                await txnReceipt.wait();

                expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args))
                    .to.emit(this.agents, 'Transfer')
                    .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5], redundancy, shards);
                expect(await this.agents.isRegistered(AGENT_ID)).to.be.equal(true);
                expect(await this.agents.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
                expect(
                    await this.agents
                        .getAgent(AGENT_ID)
                        .then((agent) => [agent.owner, agent.agentVersion.toNumber(), agent.metadata, agent.chainIds.map((chainId) => chainId.toNumber()), agent.redundancy, agent.shards])
                ).to.be.deep.equal([this.accounts.user1.address, 1, args[1], args[2], args[3], args[4]]);
                expect(await this.agents.getAgentCount()).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('1');
                expect(await this.agents.getAgentByIndex(0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(1, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(3, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(4, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(5, 0)).to.be.equal(AGENT_ID);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4, 5].length * redundancy * shards);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits - ([1, 3, 4, 5].length * redundancy * shards));
            });

            it('unordered chainIds', async function () {
                const args = [AGENT_ID, 'Metadata1', [1, 42, 3, 4, 5], redundancy, shards];
                const argsToHash = [args[0], this.accounts.user1.address, args[1], args[2], args[3], args[4]];

                const { blockNumber } = await this.agents.prepareAgent(prepareCommit(...argsToHash));
                const { timestamp } = await ethers.provider.getBlock(blockNumber);
                expect(await this.agents.getCommitTimestamp(prepareCommit(...argsToHash))).to.be.equal(timestamp);

                await network.provider.send('evm_increaseTime', [300]);

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args)).to.be.revertedWith('UnorderedArray("chainIds")');
            });

            it('update - individual Lock plan', async function () {
                const args = [AGENT_ID, 'Metadata1', [1, 3, 4], redundancy, shards];
                const argsToHash = [args[0], this.accounts.user1.address, args[1], args[2], args[3], args[4]];
                const individualKeyPrice = await this.individualLock.keyPrice();

                expect(await this.agents.getAgentCount()).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('0');

                const { blockNumber } = await this.agents.prepareAgent(prepareCommit(...argsToHash));
                const { timestamp } = await ethers.provider.getBlock(blockNumber);
                expect(await this.agents.getCommitTimestamp(prepareCommit(...argsToHash))).to.be.equal(timestamp);

                await network.provider.send('evm_increaseTime', [300]);

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                const txnReceipt = await this.individualLock.connect(this.accounts.user1).purchase(
                    [individualKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );
                await txnReceipt.wait();

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args))
                    .to.emit(this.agents, 'Transfer')
                    .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4], redundancy, shards);
                expect(await this.agents.isRegistered(AGENT_ID)).to.be.equal(true);
                expect(await this.agents.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
                expect(
                    await this.agents
                        .getAgent(AGENT_ID)
                        .then((agent) => [agent.owner, agent.agentVersion.toNumber(), agent.metadata, agent.chainIds.map((chainId) => chainId.toNumber()), agent.redundancy, agent.shards])
                ).to.be.deep.equal([this.accounts.user1.address, 1, 'Metadata1', [1, 3, 4], redundancy, shards]);
                expect(await this.agents.getAgentCount()).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('0');
                expect(await this.agents.getAgentByIndex(0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(1, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(3, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(4, 0)).to.be.equal(AGENT_ID);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4].length * redundancy * shards);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits - ([1, 3, 4].length * redundancy * shards));

                await expect(this.agents.connect(this.accounts.user1).updateAgent(AGENT_ID, 'Metadata2', [1, 2, 4, 5], redundancy, shards))
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata2', [1, 2, 4, 5], redundancy, shards);

                expect(await this.agents.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
                expect(
                    await this.agents
                        .getAgent(AGENT_ID)
                        .then((agent) => [agent.owner, agent.agentVersion.toNumber(), agent.metadata, agent.chainIds.map((chainId) => chainId.toNumber()), agent.redundancy, agent.shards])
                ).to.be.deep.equal([this.accounts.user1.address, 2, 'Metadata2', [1, 2, 4, 5], redundancy, shards]);
                expect(await this.agents.getAgentCount()).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('1');
                expect(await this.agents.getAgentByIndex(0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(1, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(4, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(5, 0)).to.be.equal(AGENT_ID);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 2, 4, 5].length * redundancy * shards);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits - ([1, 2, 4, 5].length * redundancy * shards));
            });

            it('update - team Lock plan', async function () {
                const args = [AGENT_ID, 'Metadata1', [1, 3, 4], redundancy, shards];
                const argsToHash = [args[0], this.accounts.user1.address, args[1], args[2], args[3], args[4]];
                const teamKeyPrice = await this.teamLock.keyPrice();

                expect(await this.agents.getAgentCount()).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('0');

                const { blockNumber } = await this.agents.prepareAgent(prepareCommit(...argsToHash));
                const { timestamp } = await ethers.provider.getBlock(blockNumber);
                expect(await this.agents.getCommitTimestamp(prepareCommit(...argsToHash))).to.be.equal(timestamp);

                await network.provider.send('evm_increaseTime', [300]);

                expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                const txnReceipt = await this.teamLock.connect(this.accounts.user1).purchase(
                    [teamKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );
                await txnReceipt.wait();

                expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args))
                    .to.emit(this.agents, 'Transfer')
                    .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4], redundancy, shards);
                expect(await this.agents.isRegistered(AGENT_ID)).to.be.equal(true);
                expect(await this.agents.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
                expect(
                    await this.agents
                        .getAgent(AGENT_ID)
                        .then((agent) => [agent.owner, agent.agentVersion.toNumber(), agent.metadata, agent.chainIds.map((chainId) => chainId.toNumber()), agent.redundancy, agent.shards])
                ).to.be.deep.equal([this.accounts.user1.address, 1, 'Metadata1', [1, 3, 4], redundancy, shards]);
                expect(await this.agents.getAgentCount()).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('0');
                expect(await this.agents.getAgentByIndex(0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(1, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(3, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(4, 0)).to.be.equal(AGENT_ID);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4].length * redundancy * shards);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits - ([1, 3, 4].length * redundancy * shards));

                await expect(this.agents.connect(this.accounts.user1).updateAgent(AGENT_ID, 'Metadata2', [1, 2, 4, 5], redundancy, shards))
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata2', [1, 2, 4, 5], redundancy, shards);

                expect(await this.agents.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
                expect(
                    await this.agents
                        .getAgent(AGENT_ID)
                        .then((agent) => [agent.owner, agent.agentVersion.toNumber(), agent.metadata, agent.chainIds.map((chainId) => chainId.toNumber()), agent.redundancy, agent.shards])
                ).to.be.deep.equal([this.accounts.user1.address, 2, 'Metadata2', [1, 2, 4, 5], redundancy, shards]);
                expect(await this.agents.getAgentCount()).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('1');
                expect(await this.agents.getAgentByIndex(0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(1, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(4, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(5, 0)).to.be.equal(AGENT_ID);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 2, 4, 5].length * redundancy * shards);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits - ([1, 2, 4, 5].length * redundancy * shards));
            });
        });

        describe('insufficient available bot units', async function () {
            it('unable to create bot - individual Lock plan', async function () {
                const higherRedundancy = 10;
                const higherShards = 15;
                const args = [AGENT_ID, 'Metadata1', [1, 3, 4, 5, 6], higherRedundancy, higherShards];
                const individualKeyPrice = await this.individualLock.keyPrice();

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                const txnReceipt = await this.individualLock.connect(this.accounts.user1).purchase(
                    [individualKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );
                await txnReceipt.wait();

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args)).to.be.revertedWith(`InsufficientInactiveBotUnits("${this.accounts.user1.address}")`);

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
            });

            it('unable to create bot - team Lock plan', async function () {
                const higherRedundancy = 10;
                const higherShards = 15;
                const args = [AGENT_ID, 'Metadata1', [1, 3, 4, 5, 6], higherRedundancy, higherShards];
                const individualKeyPrice = await this.teamLock.keyPrice();

                expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                const txnReceipt = await this.teamLock.connect(this.accounts.user1).purchase(
                    [individualKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );
                await txnReceipt.wait();

                expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args)).to.be.revertedWith(`InsufficientInactiveBotUnits("${this.accounts.user1.address}")`);

                expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);
            });

            it('create bot, unable to create second - individual Lock plan', async function () {
                const args = [AGENT_ID, 'Metadata1', [1, 3, 4, 5], redundancy, shards];
                const individualKeyPrice = await this.individualLock.keyPrice();

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                const txnReceipt = await this.individualLock.connect(this.accounts.user1).purchase(
                    [individualKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );
                await txnReceipt.wait();

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args))
                    .to.emit(this.agents, 'Transfer')
                    .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5], redundancy, shards);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4, 5].length * redundancy * shards);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits - ([1, 3, 4, 5].length * redundancy * shards));

                const AGENT_ID_TWO = ethers.utils.hexlify(ethers.utils.randomBytes(32));
                const argsTwo = [AGENT_ID_TWO, 'Metadata2', [1, 3, 4, 5, 6], redundancy, shards];

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...argsTwo)).to.be.revertedWith(`InsufficientInactiveBotUnits("${this.accounts.user1.address}")`);

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits - ([1, 3, 4, 5].length * redundancy * shards));
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4, 5].length * redundancy * shards);
            });

            it('create bot, unable to create second - team Lock plan', async function () {
                const args = [AGENT_ID, 'Metadata1', [1, 3, 4, 5], redundancy, shards];
                const teamKeyPrice = await this.teamLock.keyPrice();

                expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                const txnReceipt = await this.teamLock.connect(this.accounts.user1).purchase(
                    [teamKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );
                await txnReceipt.wait();

                expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args))
                    .to.emit(this.agents, 'Transfer')
                    .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5], redundancy, shards);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4, 5].length * redundancy * shards);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits - ([1, 3, 4, 5].length * redundancy * shards));

                const AGENT_ID_TWO = ethers.utils.hexlify(ethers.utils.randomBytes(32));
                const argsTwo = [AGENT_ID_TWO, 'Metadata2', [1, 3, 4, 5, 6], redundancy, shards];

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...argsTwo)).to.be.revertedWith(`InsufficientInactiveBotUnits("${this.accounts.user1.address}")`);

                expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits - ([1, 3, 4, 5].length * redundancy * shards));
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4, 5].length * redundancy * shards);
            });

            it('create bot, unable to update - individual Lock plan', async function () {
                const args = [AGENT_ID, 'Metadata1', [1, 3, 4, 5], redundancy, shards];
                const individualKeyPrice = await this.individualLock.keyPrice();

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                const txnReceipt = await this.individualLock.connect(this.accounts.user1).purchase(
                    [individualKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );
                await txnReceipt.wait();

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args))
                    .to.emit(this.agents, 'Transfer')
                    .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5], redundancy, shards);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4, 5].length * redundancy * shards);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits - ([1, 3, 4, 5].length * redundancy * shards));

                const higherRedundancy = 10;
                const higherShards = 15;
                const argsTwo = [AGENT_ID, 'Metadata2', [1, 3, 4, 5, 6], higherRedundancy, higherShards];

                await expect(this.agents.connect(this.accounts.user1).updateAgent(...argsTwo)).to.be.revertedWith(`InsufficientInactiveBotUnits("${this.accounts.user1.address}")`);

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits - ([1, 3, 4, 5].length * redundancy * shards));
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4, 5].length * redundancy * shards);
            });

            it('create bot, unable to update - team Lock plan', async function () {
                const args = [AGENT_ID, 'Metadata1', [1, 3, 4, 5], redundancy, shards];
                const teamKeyPrice = await this.teamLock.keyPrice();

                expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                const txnReceipt = await this.teamLock.connect(this.accounts.user1).purchase(
                    [teamKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );
                await txnReceipt.wait();

                expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args))
                    .to.emit(this.agents, 'Transfer')
                    .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5], redundancy, shards);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4, 5].length * redundancy * shards);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits - ([1, 3, 4, 5].length * redundancy * shards));

                const higherRedundancy = 10;
                const higherShards = 15;
                const argsTwo = [AGENT_ID, 'Metadata2', [1, 3, 4, 5, 6], higherRedundancy, higherShards];

                await expect(this.agents.connect(this.accounts.user1).updateAgent(...argsTwo)).to.be.revertedWith(`InsufficientInactiveBotUnits("${this.accounts.user1.address}")`);

                expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits - ([1, 3, 4, 5].length * redundancy * shards));
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4, 5].length * redundancy * shards);
            });

            it('unable to create bot - non-Forta related Lock plan', async function () {
                const args = [AGENT_ID, 'Metadata1', [1, 3, 4, 5, 6], redundancy, shards];
                const otherKeyPrice = await this.otherLock.keyPrice();

                expect(await this.otherLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                const txnReceipt = await this.otherLock.connect(this.accounts.user1).purchase(
                    [otherKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );
                await txnReceipt.wait();

                expect(await this.otherLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args)).to.be.revertedWith(`ValidMembershipRequired("${this.accounts.user1.address}")`);

                expect(await this.otherLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);
            });

            it('unable to create bot - no valid plan', async function () {
                const args = [AGENT_ID, 'Metadata1', [1, 3, 4, 5, 6], redundancy, shards];

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args)).to.be.revertedWith(`ValidMembershipRequired("${this.accounts.user1.address}")`);

                expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);
            });
        });

        describe('special case bots', async function () {
            it('free trial bot', async function () {
                expect(await this.agents.getFreeTrialAgentUnitsLimit()).to.be.equal(0);
                await expect(this.agents.connect(this.accounts.manager).setFreeTrialAgentUnits(99))
                    .to.emit(this.agents, 'FreeTrailAgentUnitsUpdated')
                    .withArgs(99);
                expect(await this.agents.getFreeTrialAgentUnitsLimit()).to.be.equal(99);

                const args = [AGENT_ID, 'Metadata1', [1], redundancy, shards];
                const individualKeyPrice = await this.individualLock.keyPrice();

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                const txnReceipt = await this.individualLock.connect(this.accounts.user1).purchase(
                    [individualKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );
                await txnReceipt.wait();

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args))
                    .to.emit(this.agents, 'Transfer')
                    .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata1', [1], redundancy, shards);

                await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.AGENT, AGENT_ID, '100');

                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(true);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
            });

            it('public goods bot', async function () {
                expect(await this.agents.isPublicGoodAgent(AGENT_ID)).to.be.equal(false);
                await expect(this.agents.connect(this.accounts.admin).setAgentAsPublicGood(AGENT_ID))
                    .to.emit(this.agents, 'PublicGoodAgentDeclared')
                    .withArgs(AGENT_ID);
                expect(await this.agents.isPublicGoodAgent(AGENT_ID)).to.be.equal(true);

                const args = [AGENT_ID, 'Metadata1', [1, 3, 4, 5], redundancy, shards];
                const individualKeyPrice = await this.individualLock.keyPrice();

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                const txnReceipt = await this.individualLock.connect(this.accounts.user1).purchase(
                    [individualKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );
                await txnReceipt.wait();

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args))
                    .to.emit(this.agents, 'Transfer')
                    .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5], redundancy, shards);

                await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.AGENT, AGENT_ID, '100');
                
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(true);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
            })
        });

        describe('switch plans', async function () {
            it('successful plan switch', async function () {
                const args = [AGENT_ID, 'Metadata1', [1, 3, 4], redundancy, shards];
                const individualKeyPrice = await this.individualLock.keyPrice();
                const teamKeyPrice = await this.teamLock.keyPrice();

                expect(await this.agents.getAgentCount()).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('0');

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                const txnReceipt = await this.individualLock.connect(this.accounts.user1).purchase(
                    [individualKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );
                const purchaseTxn = await txnReceipt.wait();
                const individualKeyId = ethers.BigNumber.from(purchaseTxn.logs[0].topics[3]);

                expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(1);
                expect(await this.teamLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.individualLock.ownerOf(individualKeyId)).to.be.equal(this.accounts.user1.address);
                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args))
                    .to.emit(this.agents, 'Transfer')
                    .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4], redundancy, shards);
                expect(await this.agents.isRegistered(AGENT_ID)).to.be.equal(true);
                expect(await this.agents.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
                expect(
                    await this.agents
                        .getAgent(AGENT_ID)
                        .then((agent) => [agent.owner, agent.agentVersion.toNumber(), agent.metadata, agent.chainIds.map((chainId) => chainId.toNumber()), agent.redundancy, agent.shards])
                ).to.be.deep.equal([this.accounts.user1.address, 1, 'Metadata1', [1, 3, 4], redundancy, shards]);
                expect(await this.agents.getAgentCount()).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('0');
                expect(await this.agents.getAgentByIndex(0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(1, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(3, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(4, 0)).to.be.equal(AGENT_ID);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4].length * redundancy * shards);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits - ([1, 3, 4].length * redundancy * shards));

                await expect(this.agents.connect(this.accounts.user1).updateAgent(AGENT_ID, 'Metadata2', [1, 2, 4, 5], redundancy, shards))
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata2', [1, 2, 4, 5], redundancy, shards);

                expect(await this.agents.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
                expect(
                    await this.agents
                        .getAgent(AGENT_ID)
                        .then((agent) => [agent.owner, agent.agentVersion.toNumber(), agent.metadata, agent.chainIds.map((chainId) => chainId.toNumber()), agent.redundancy, agent.shards])
                ).to.be.deep.equal([this.accounts.user1.address, 2, 'Metadata2', [1, 2, 4, 5], redundancy, shards]);
                expect(await this.agents.getAgentCount()).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('1');
                expect(await this.agents.getAgentByIndex(0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(1, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(2, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(4, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(5, 0)).to.be.equal(AGENT_ID);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 2, 4, 5].length * redundancy * shards);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits - ([1, 2, 4, 5].length * redundancy * shards));

                await expect(this.agents.connect(this.accounts.user1).updateAgent(AGENT_ID, 'Metadata3', [1, 2], redundancy, shards))
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata3', [1, 2], redundancy, shards);

                expect(await this.agents.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
                expect(
                    await this.agents
                        .getAgent(AGENT_ID)
                        .then((agent) => [agent.owner, agent.agentVersion.toNumber(), agent.metadata, agent.chainIds.map((chainId) => chainId.toNumber()), agent.redundancy, agent.shards])
                ).to.be.deep.equal([this.accounts.user1.address, 3, 'Metadata3', [1, 2], redundancy, shards]);
                expect(await this.agents.getAgentCount()).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('0');
                expect(await this.agents.getAgentByIndex(0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(1, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(2, 0)).to.be.equal(AGENT_ID);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 2].length * redundancy * shards);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits - ([1, 2].length * redundancy * shards));

                await expect(this.teamLock.connect(this.accounts.user1).purchase(
                    [teamKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                )).to.be.revertedWith(
                    `LimitOneValidSubscription("${this.individualLock.address}", "${this.accounts.user1.address}")`
                );

                const txnReceiptTwo = await this.individualLock.connect(this.accounts.user1).cancelAndRefund(individualKeyId);
                await txnReceiptTwo.wait();

                expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.teamLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);

                const txnReceiptThree = await this.teamLock.connect(this.accounts.user1).purchase(
                    [teamKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );

                const purchaseTxnThree = await txnReceiptThree.wait();
                const teamKeyId = ethers.BigNumber.from(purchaseTxnThree.logs[0].topics[3]);

                expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.teamLock.balanceOf(this.accounts.user1.address)).to.be.equal(1);
                expect(await this.teamLock.ownerOf(teamKeyId)).to.be.equal(this.accounts.user1.address);
                expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits - ([1, 2].length * redundancy * shards));

                await expect(this.agents.connect(this.accounts.user1).updateAgent(AGENT_ID, 'Metadata4', [1, 4, 5], redundancy, shards))
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata4', [1, 4, 5], redundancy, shards);

                expect(await this.agents.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
                expect(
                    await this.agents
                        .getAgent(AGENT_ID)
                        .then((agent) => [agent.owner, agent.agentVersion.toNumber(), agent.metadata, agent.chainIds.map((chainId) => chainId.toNumber()), agent.redundancy, agent.shards])
                ).to.be.deep.equal([this.accounts.user1.address, 4, 'Metadata4', [1, 4, 5], redundancy, shards]);
                expect(await this.agents.getAgentCount()).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('1');
                expect(await this.agents.getAgentByIndex(0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(1, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(4, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(5, 0)).to.be.equal(AGENT_ID);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 4, 5].length * redundancy * shards);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits - ([1, 4, 5].length * redundancy * shards));
            });

            it('unable to switch plans - active bot units balance too high', async function () {
                const args = [AGENT_ID, 'Metadata1', [1, 2, 4, 5], redundancy, shards];
                const individualKeyPrice = await this.individualLock.keyPrice();
                const teamKeyPrice = await this.teamLock.keyPrice();

                expect(await this.agents.getAgentCount()).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('0');

                expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                const txnReceipt = await this.teamLock.connect(this.accounts.user1).purchase(
                    [teamKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );
                const purchaseTxn = await txnReceipt.wait();
                const teamKeyId = ethers.BigNumber.from(purchaseTxn.logs[0].topics[3]);

                expect(await this.teamLock.balanceOf(this.accounts.user1.address)).to.be.equal(1);
                expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.teamLock.ownerOf(teamKeyId)).to.be.equal(this.accounts.user1.address);
                expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args))
                    .to.emit(this.agents, 'Transfer')
                    .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 2, 4, 5], redundancy, shards);
                expect(await this.agents.isRegistered(AGENT_ID)).to.be.equal(true);
                expect(await this.agents.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
                expect(
                    await this.agents
                        .getAgent(AGENT_ID)
                        .then((agent) => [agent.owner, agent.agentVersion.toNumber(), agent.metadata, agent.chainIds.map((chainId) => chainId.toNumber()), agent.redundancy, agent.shards])
                ).to.be.deep.equal([this.accounts.user1.address, 1, 'Metadata1', [1, 2, 4, 5], redundancy, shards]);
                expect(await this.agents.getAgentCount()).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('1');
                expect(await this.agents.getAgentByIndex(0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(1, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(2, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(4, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(5, 0)).to.be.equal(AGENT_ID);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 2, 4, 5].length * redundancy * shards);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits - ([1, 2, 4, 5].length * redundancy * shards));

                await expect(this.agents.connect(this.accounts.user1).updateAgent(AGENT_ID, 'Metadata2', [1, 2, 4], redundancy, shards))
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata2', [1, 2, 4], redundancy, shards);

                expect(await this.agents.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
                expect(
                    await this.agents
                        .getAgent(AGENT_ID)
                        .then((agent) => [agent.owner, agent.agentVersion.toNumber(), agent.metadata, agent.chainIds.map((chainId) => chainId.toNumber()), agent.redundancy, agent.shards])
                ).to.be.deep.equal([this.accounts.user1.address, 2, 'Metadata2', [1, 2, 4], redundancy, shards]);
                expect(await this.agents.getAgentCount()).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('0');
                expect(await this.agents.getAgentByIndex(0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(1, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(2, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(4, 0)).to.be.equal(AGENT_ID);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 2, 4].length * redundancy * shards);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits - ([1, 2, 4].length * redundancy * shards));

                await expect(this.agents.connect(this.accounts.user1).updateAgent(AGENT_ID, 'Metadata3', [1, 2, 4, 5, 6, 7], redundancy, shards))
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata3', [1, 2, 4, 5, 6, 7], redundancy, shards);

                expect(await this.agents.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
                expect(
                    await this.agents
                        .getAgent(AGENT_ID)
                        .then((agent) => [agent.owner, agent.agentVersion.toNumber(), agent.metadata, agent.chainIds.map((chainId) => chainId.toNumber()), agent.redundancy, agent.shards])
                ).to.be.deep.equal([this.accounts.user1.address, 3, 'Metadata3', [1, 2, 4, 5, 6, 7], redundancy, shards]);
                expect(await this.agents.getAgentCount()).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(6)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(7)).to.be.equal('1');
                expect(await this.agents.getAgentByIndex(0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(1, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(2, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(4, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(5, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(6, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(7, 0)).to.be.equal(AGENT_ID);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 2, 4, 5, 6, 7].length * redundancy * shards);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits - ([1, 2, 4, 5, 6, 7].length * redundancy * shards));

                await expect(this.individualLock.connect(this.accounts.user1).purchase(
                    [teamKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                )).to.be.revertedWith(
                    `LimitOneValidSubscription("${this.teamLock.address}", "${this.accounts.user1.address}")`
                );

                const txnReceiptTwo = await this.teamLock.connect(this.accounts.user1).cancelAndRefund(teamKeyId, { gasLimit: 21000000 });
                await txnReceiptTwo.wait();

                expect(await this.teamLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);

                await expect(this.individualLock.connect(this.accounts.user1).purchase(
                    [individualKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                )).to.be.revertedWith(
                    `InsufficientInactiveBotUnits("${this.accounts.user1.address}")`
                );
            });
        });

        describe('key expiry', async function () {
            it('key expires, bot is not enabled', async function () {
                const args = [AGENT_ID, 'Metadata1', [1, 3, 4, 5], redundancy, shards];
                const individualKeyPrice = await this.individualLock.keyPrice();

                expect(await this.agents.getAgentCount()).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('0');

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                const txnReceipt = await this.individualLock.connect(this.accounts.user1).purchase(
                    [individualKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );
                await txnReceipt.wait();

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args))
                    .to.emit(this.agents, 'Transfer')
                    .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5], redundancy, shards);

                expect(await this.agents.isRegistered(AGENT_ID)).to.be.equal(true);
                expect(await this.agents.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
                expect(
                    await this.agents
                        .getAgent(AGENT_ID)
                        .then((agent) => [agent.owner, agent.agentVersion.toNumber(), agent.metadata, agent.chainIds.map((chainId) => chainId.toNumber()), agent.redundancy, agent.shards])
                ).to.be.deep.equal([this.accounts.user1.address, 1, args[1], args[2], args[3], args[4]]);
                expect(await this.agents.getAgentCount()).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('1');
                expect(await this.agents.getAgentByIndex(0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(1, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(3, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(4, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(5, 0)).to.be.equal(AGENT_ID);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4, 5].length * redundancy * shards);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits - ([1, 3, 4, 5].length * redundancy * shards));
                
                await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.AGENT, AGENT_ID, '100');
                expect(await this.agents.getDisableFlags(AGENT_ID)).to.be.equal([0]);
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(true);

                await network.provider.send('evm_increaseTime', [704800]);
                await network.provider.send('evm_mine');

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(false);
            });

            it('key expires, owner renews, bot is enabled', async function () {
                const args = [AGENT_ID, 'Metadata1', [1, 3, 4, 5], redundancy, shards];
                const individualKeyPrice = await this.individualLock.keyPrice();

                expect(await this.agents.getAgentCount()).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('0');

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                const txnReceipt = await this.individualLock.connect(this.accounts.user1).purchase(
                    [individualKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );
                const purchaseTxn = await txnReceipt.wait();
                const individualKeyId = ethers.BigNumber.from(purchaseTxn.logs[0].topics[3]);

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args))
                    .to.emit(this.agents, 'Transfer')
                    .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5], redundancy, shards);

                expect(await this.agents.isRegistered(AGENT_ID)).to.be.equal(true);
                expect(await this.agents.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
                expect(
                    await this.agents
                        .getAgent(AGENT_ID)
                        .then((agent) => [agent.owner, agent.agentVersion.toNumber(), agent.metadata, agent.chainIds.map((chainId) => chainId.toNumber()), agent.redundancy, agent.shards])
                ).to.be.deep.equal([this.accounts.user1.address, 1, args[1], args[2], args[3], args[4]]);
                expect(await this.agents.getAgentCount()).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('1');
                expect(await this.agents.getAgentByIndex(0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(1, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(3, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(4, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(5, 0)).to.be.equal(AGENT_ID);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4, 5].length * redundancy * shards);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits - ([1, 3, 4, 5].length * redundancy * shards));
                
                await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.AGENT, AGENT_ID, '100');
                expect(await this.agents.getDisableFlags(AGENT_ID)).to.be.equal([0]);
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(true);

                await network.provider.send('evm_increaseTime', [704800]);
                await network.provider.send('evm_mine');

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(false);

                const txnReceiptTwo = await this.individualLock.connect(this.accounts.user1).extend(
                    individualKeyPrice,
                    individualKeyId,
                    this.accounts.user1.address,
                    "0x",
                    { gasLimit: 21000000 }
                );
                await txnReceiptTwo.wait();

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(true);
            });

            it('key expires, renewed by other account, bot is enabled', async function () {
                const args = [AGENT_ID, 'Metadata1', [1, 3, 4, 5], redundancy, shards];
                const individualKeyPrice = ethers.BigNumber.from(await this.individualLock.keyPrice());

                expect(await this.agents.getAgentCount()).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('0');

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                const txnReceipt = await this.individualLock.connect(this.accounts.user1).purchase(
                    [individualKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );
                const purchaseTxn = await txnReceipt.wait();
                const individualKeyId = ethers.BigNumber.from(purchaseTxn.logs[0].topics[3]);

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args))
                    .to.emit(this.agents, 'Transfer')
                    .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5], redundancy, shards);

                expect(await this.agents.isRegistered(AGENT_ID)).to.be.equal(true);
                expect(await this.agents.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
                expect(
                    await this.agents
                        .getAgent(AGENT_ID)
                        .then((agent) => [agent.owner, agent.agentVersion.toNumber(), agent.metadata, agent.chainIds.map((chainId) => chainId.toNumber()), agent.redundancy, agent.shards])
                ).to.be.deep.equal([this.accounts.user1.address, 1, args[1], args[2], args[3], args[4]]);
                expect(await this.agents.getAgentCount()).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('1');
                expect(await this.agents.getAgentByIndex(0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(1, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(3, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(4, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(5, 0)).to.be.equal(AGENT_ID);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4, 5].length * redundancy * shards);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits - ([1, 3, 4, 5].length * redundancy * shards));
                
                await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.AGENT, AGENT_ID, '100');
                expect(await this.agents.getDisableFlags(AGENT_ID)).to.be.equal([0]);
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(true);

                await network.provider.send('evm_increaseTime', [704800]);
                await network.provider.send('evm_mine');

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(false);

                const ownerBalancePreRenewal = ethers.BigNumber.from(await this.token.balanceOf(this.accounts.user1.address));

                const txnReceiptTwo = await this.individualLock.connect(this.accounts.user2).renewMembershipFor(
                    individualKeyId,
                    this.accounts.user1.address,
                    { gasLimit: 21000000 }
                );
                await txnReceiptTwo.wait();

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(true);
                expect(await this.token.balanceOf(this.accounts.user1.address)).to.be.equal(ownerBalancePreRenewal.sub(individualKeyPrice));
            });

            it('key expires, renewed by Lock manager, bot is enabled', async function () {
                const args = [AGENT_ID, 'Metadata1', [1, 3, 4, 5], redundancy, shards];
                const individualKeyPrice = ethers.BigNumber.from(await this.individualLock.keyPrice());

                expect(await this.agents.getAgentCount()).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('0');

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                const txnReceipt = await this.individualLock.connect(this.accounts.user1).purchase(
                    [individualKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );
                const purchaseTxn = await txnReceipt.wait();
                const individualKeyId = ethers.BigNumber.from(purchaseTxn.logs[0].topics[3]);

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);

                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args))
                    .to.emit(this.agents, 'Transfer')
                    .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5], redundancy, shards);

                expect(await this.agents.isRegistered(AGENT_ID)).to.be.equal(true);
                expect(await this.agents.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
                expect(
                    await this.agents
                        .getAgent(AGENT_ID)
                        .then((agent) => [agent.owner, agent.agentVersion.toNumber(), agent.metadata, agent.chainIds.map((chainId) => chainId.toNumber()), agent.redundancy, agent.shards])
                ).to.be.deep.equal([this.accounts.user1.address, 1, args[1], args[2], args[3], args[4]]);
                expect(await this.agents.getAgentCount()).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('1');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('1');
                expect(await this.agents.getAgentByIndex(0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(1, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(3, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(4, 0)).to.be.equal(AGENT_ID);
                expect(await this.agents.getAgentByChainAndIndex(5, 0)).to.be.equal(AGENT_ID);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4, 5].length * redundancy * shards);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits - ([1, 3, 4, 5].length * redundancy * shards));
                
                await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.AGENT, AGENT_ID, '100');
                expect(await this.agents.getDisableFlags(AGENT_ID)).to.be.equal([0]);
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(true);

                await network.provider.send('evm_increaseTime', [704800]);
                await network.provider.send('evm_mine');

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(false);

                const ownerBalancePreRenewal = ethers.BigNumber.from(await this.token.balanceOf(this.accounts.user1.address));

                const txnReceiptTwo = await this.individualLock.connect(this.accounts.admin).grantKeyExtension(
                    individualKeyId,
                    604800,
                    { gasLimit: 21000000 }
                );
                await txnReceiptTwo.wait();

                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(true);
                expect(await this.token.balanceOf(this.accounts.user1.address)).to.be.equal(ownerBalancePreRenewal);
            });
        })
    });

    it('isStakedOverMin false if non existant', async function () {
        expect(await this.agents.isStakedOverMin(AGENT_ID)).to.equal(false);
    });

    it('setting delay is protected', async function () {
        await expect(this.agents.connect(this.accounts.other).setFrontRunningDelay('1800')).to.be.revertedWith(
            `MissingRole("${this.roles.AGENT_ADMIN}", "${this.accounts.other.address}")`
        );
    });

    describe('enable and disable', async function () {
        beforeEach(async function () {
            const args = [AGENT_ID, 'Metadata1', [1, 3, 4, 5], redundancy, shards];
            const argsToHash = [args[0], this.accounts.user1.address, args[1], args[2], args[3], args[4]];
            const individualKeyPrice = await this.individualLock.keyPrice();
            await expect(this.agents.prepareAgent(prepareCommit(...argsToHash))).to.be.not.reverted;
            await network.provider.send('evm_increaseTime', [300]);

            expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
            const individualTxnReceipt = await this.individualLock.connect(this.accounts.user1).purchase(
                [individualKeyPrice],
                [this.accounts.user1.address],
                [this.accounts.user1.address],
                [ethers.constants.AddressZero],
                [[]],
                { gasLimit: 21000000 }
            );
            await individualTxnReceipt.wait();

            expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
            expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
            expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);

            await expect(this.agents.connect(this.accounts.user1).registerAgent(...args)).to.be.not.reverted;
            expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4, 5].length * redundancy * shards);
            await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.AGENT, AGENT_ID, '100');
        });

        it('isEnabled is false for non registered agents, even if staked', async function () {
            const randomAgent = '123456789';
            await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.AGENT, randomAgent, '100');
            expect(await this.agents.isEnabled(randomAgent)).to.be.equal(false);
        });

        describe('manager', async function () {
            it('disable', async function () {
                expect(await this.agents.getDisableFlags(AGENT_ID)).to.be.equal([0]);

                await expect(this.agents.connect(this.accounts.manager).disableAgent(AGENT_ID, 0)).to.emit(this.agents, 'AgentEnabled').withArgs(AGENT_ID, false, 0, false);

                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(false);
                expect(await this.agents.getDisableFlags(AGENT_ID)).to.be.equal([1]);
            });

            it('re-enable', async function () {
                await expect(this.agents.connect(this.accounts.manager).disableAgent(AGENT_ID, 0)).to.emit(this.agents, 'AgentEnabled').withArgs(AGENT_ID, false, 0, false);

                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(false);

                await expect(this.agents.connect(this.accounts.manager).enableAgent(AGENT_ID, 0)).to.emit(this.agents, 'AgentEnabled').withArgs(AGENT_ID, true, 0, true);

                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits - ([1, 3, 4, 5].length * redundancy * shards));
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4, 5].length * redundancy * shards);
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(true);
            });

            it('restricted', async function () {
                await expect(this.agents.connect(this.accounts.other).disableAgent(AGENT_ID, 0)).to.be.reverted;
            });
        });

        describe('owner', async function () {
            it('disable', async function () {
                expect(await this.agents.getDisableFlags(AGENT_ID)).to.be.equal([0]);

                await expect(this.agents.connect(this.accounts.user1).disableAgent(AGENT_ID, 1)).to.emit(this.agents, 'AgentEnabled').withArgs(AGENT_ID, false, 1, false);

                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(false);
                expect(await this.agents.getDisableFlags(AGENT_ID)).to.be.equal([2]);
            });

            it('re-enable', async function () {
                await expect(this.agents.connect(this.accounts.user1).disableAgent(AGENT_ID, 1)).to.emit(this.agents, 'AgentEnabled').withArgs(AGENT_ID, false, 1, false);

                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(false);

                await expect(this.agents.connect(this.accounts.user1).enableAgent(AGENT_ID, 1)).to.emit(this.agents, 'AgentEnabled').withArgs(AGENT_ID, true, 1, true);

                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits - ([1, 3, 4, 5].length * redundancy * shards));
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4, 5].length * redundancy * shards);
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(true);
            });

            it('restricted', async function () {
                await expect(this.agents.connect(this.accounts.other).disableAgent(AGENT_ID, 1)).to.be.reverted;
            });
        });

        describe('hybrid', async function () {
            it('owner cannot re-enable after admin disable', async function () {
                await expect(this.agents.connect(this.accounts.manager).disableAgent(AGENT_ID, 0)).to.emit(this.agents, 'AgentEnabled').withArgs(AGENT_ID, false, 0, false);

                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(false);

                await expect(this.agents.connect(this.accounts.user1).enableAgent(AGENT_ID, 1)).to.emit(this.agents, 'AgentEnabled').withArgs(AGENT_ID, false, 1, true);

                // If a bot owner enables their bot after an admin
                // disabled it, their bot units balance will be
                // affected, but their bot will still be disabled
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4, 5].length * redundancy * shards);
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(false);
            });

            it('admin cannot re-enable after owner disable', async function () {
                await expect(this.agents.connect(this.accounts.user1).disableAgent(AGENT_ID, 1)).to.emit(this.agents, 'AgentEnabled').withArgs(AGENT_ID, false, 1, false);

                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(false);

                await expect(this.agents.connect(this.accounts.manager).enableAgent(AGENT_ID, 0)).to.emit(this.agents, 'AgentEnabled').withArgs(AGENT_ID, false, 0, true);

                // If an admin enables a bot after a bot owner
                // disabled it, owner's bot units balance will be
                // affected, but their bot will still be disabled
                expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4, 5].length * redundancy * shards);
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(false);
            });
        });

        describe('stake', async function () {
            it('isEnabled reacts to stake changes', async function () {
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(true);
                await this.agents.connect(this.accounts.manager).setStakeThreshold({ max: '100000', min: '10000', activated: true });
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(false);
                await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.AGENT, AGENT_ID, '10000');
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(true);
            });
        });
    });

    describe('access control', async function () {
        it('only AGENT_ADMIN_ROLE can set the free trial bot units', async function () {
            expect(await this.agents.getFreeTrialAgentUnitsLimit()).to.be.equal(0);
            
            await expect(this.agents.connect(this.accounts.other).setFreeTrialAgentUnits(99))
                .to.be.revertedWith(`MissingRole("${this.roles.AGENT_ADMIN}", "${this.accounts.other.address}")`);

            await expect(this.agents.connect(this.accounts.manager).setFreeTrialAgentUnits(99))
                .to.emit(this.agents, 'FreeTrailAgentUnitsUpdated')
                .withArgs(99);

            expect(await this.agents.getFreeTrialAgentUnitsLimit()).to.be.equal(99);
        });

        it('only AGENT_ADMIN_ROLE can declare a public goods bot', async function () {
            expect(await this.agents.isPublicGoodAgent(AGENT_ID)).to.be.equal(false);
            
            await expect(this.agents.connect(this.accounts.other).setAgentAsPublicGood(AGENT_ID))
                .to.be.revertedWith(`MissingRole("${this.roles.PUBLIC_GOOD_ADMIN}", "${this.accounts.other.address}")`);

            await expect(this.agents.connect(this.accounts.admin).setAgentAsPublicGood(AGENT_ID))
                .to.emit(this.agents, 'PublicGoodAgentDeclared')
                .withArgs(AGENT_ID);

            expect(await this.agents.isPublicGoodAgent(AGENT_ID)).to.be.equal(true);
        });

        it('only AGENT_ADMIN_ROLE can set the execution fees start time', async function () {
            expect(await this.agents.getExecutionFeesStartTime()).to.be.equal(0);
            
            await expect(this.agents.connect(this.accounts.other).setExecutionFeesStartTime(99))
                .to.be.revertedWith(`MissingRole("${this.roles.AGENT_ADMIN}", "${this.accounts.other.address}")`);

            await expect(this.agents.connect(this.accounts.manager).setExecutionFeesStartTime(99))
                .to.emit(this.agents, 'ExecutionFeesStartTimeUpdated')
                .withArgs(99);

            expect(await this.agents.getExecutionFeesStartTime()).to.be.equal(99);
        });
    });
});

describe('Bot Migration - Execution Fees', async function () {
    prepare();

    // Bot owner registers on the previous version of the AgentRegistry
    // then bot still exists in new implementation
    beforeEach(async function () {
        const AgentRegistry_0_1_6 = await ethers.getContractFactory('AgentRegistry_0_1_6');
        this.testAgents = await upgrades.deployProxy(AgentRegistry_0_1_6, [this.contracts.access.address, 'Forta Agents', 'FAgents'], {
            kind: 'uups',
            constructorArgs: [this.contracts.forwarder.address],
            unsafeAllow: ['delegatecall'],
        });
        await this.testAgents.deployed();

        await this.access.connect(this.accounts.admin).grantRole(this.roles.BOT_UNITS_CAPACITY_ADMIN, this.subscriptionManager.address);
        await this.access.connect(this.accounts.admin).grantRole(this.roles.BOT_ACTIVE_UNITS_ADMIN, this.testAgents.address);
        await this.access.connect(this.accounts.admin).grantRole(this.roles.INDIVIDUAL_LOCK_ADMIN, this.individualLock.address);
        await this.access.connect(this.accounts.admin).grantRole(this.roles.TEAM_LOCK_ADMIN, this.teamLock.address);

        const args = [AGENT_ID, 'Metadata1', [1, 3, 4, 5]];

        await this.subjectGateway.connect(this.accounts.admin).setStakeSubject(1, this.testAgents.address);
        await this.testAgents.connect(this.accounts.admin).setSubjectHandler(this.subjectGateway.address);
        await this.testAgents.connect(this.accounts.manager).setStakeThreshold({ min: '100', max: '500', activated: true });
        await this.token.connect(this.accounts.minter).mint(this.accounts.user1.address, ethers.utils.parseEther('10000'));
        await this.token.connect(this.accounts.user1).approve(this.staking.address, ethers.constants.MaxUint256);
        await this.token.connect(this.accounts.user1).approve(this.individualLock.address, ethers.constants.MaxUint256);
        await this.token.connect(this.accounts.user1).approve(this.teamLock.address, ethers.constants.MaxUint256);

        await expect(this.testAgents.connect(this.accounts.user1).registerAgent(...args))
            .to.emit(this.testAgents, 'Transfer')
            .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
            .to.emit(this.testAgents, 'AgentUpdated')
            .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5]);

        expect(await this.testAgents.isEnabled(AGENT_ID)).to.be.equal(false);
        expect(await this.testAgents.isRegistered(AGENT_ID)).to.be.equal(true);

        await this.staking.connect(this.accounts.user1).deposit(1, AGENT_ID, '100');

        expect(await this.testAgents.isEnabled(AGENT_ID)).to.be.equal(true);
        expect(await this.testAgents.isRegistered(AGENT_ID)).to.be.equal(true);

        this.testAgents = await upgrades.upgradeProxy(
            this.testAgents.address,
            await ethers.getContractFactory('AgentRegistry'),
            {
                constructorArgs: [this.contracts.forwarder.address],
                unsafeAllow: ['delegatecall'],
            }
        );

        const currentTimestamp = await helpers.time.latest();

        await this.testAgents.connect(this.accounts.manager).setExecutionFeesStartTime(currentTimestamp + 1000);
        await this.testAgents.connect(this.accounts.manager).setSubscriptionPlans(this.individualLock.address, this.teamLock.address);
        await this.testAgents.connect(this.accounts.manager).setBotUnits(this.botUnits.address);

        expect(await this.testAgents.getExecutionFeesStartTime()).to.be.equal(currentTimestamp + 1000);
        expect(await this.testAgents.isEnabled(AGENT_ID)).to.be.equal(true);
        expect(await this.testAgents.isRegistered(AGENT_ID)).to.be.equal(true);
    });

    it('isEnabled false - execution fees start, owner has no valid key, bot is not updated to execution fees', async function () {
        await network.provider.send('evm_increaseTime', [1100]);
        await network.provider.send('evm_mine');

        expect(await this.testAgents.isEnabled(AGENT_ID)).to.be.equal(false);
        expect(await this.testAgents.isRegistered(AGENT_ID)).to.be.equal(true);
        expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
        expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
        expect(await this.testAgents.isAgentUtilizingAgentUnits(AGENT_ID)).to.be.equal(false);
    });

    it('isEnabled false - execution fees start, owner HAS valid key, bot is not updated to execution fees', async function () {
        await network.provider.send('evm_increaseTime', [1100]);
        await network.provider.send('evm_mine');

        expect(await this.testAgents.isEnabled(AGENT_ID)).to.be.equal(false);
        expect(await this.testAgents.isRegistered(AGENT_ID)).to.be.equal(true);
        expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
        expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
        expect(await this.testAgents.isAgentUtilizingAgentUnits(AGENT_ID)).to.be.equal(false);

        const individualKeyPrice = await this.individualLock.keyPrice();
        expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
        expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

        const txnReceipt = await this.individualLock.connect(this.accounts.user1).purchase(
            [individualKeyPrice],
            [this.accounts.user1.address],
            [this.accounts.user1.address],
            [ethers.constants.AddressZero],
            [[]],
            { gasLimit: 21000000 }
        );
        await txnReceipt.wait();

        expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
        expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
        expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);

        expect(await this.testAgents.isEnabled(AGENT_ID)).to.be.equal(false);
        expect(await this.testAgents.isRegistered(AGENT_ID)).to.be.equal(true);
        expect(await this.testAgents.isAgentUtilizingAgentUnits(AGENT_ID)).to.be.equal(false);
    });

    it('isEnabled false - execution fees start, owner has no valid key, bot is not updated to execution fees. Cannot update bot without valid key', async function () {
        await network.provider.send('evm_increaseTime', [1100]);
        await network.provider.send('evm_mine');

        expect(await this.testAgents.isEnabled(AGENT_ID)).to.be.equal(false);
        expect(await this.testAgents.isRegistered(AGENT_ID)).to.be.equal(true);
        expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
        expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
        expect(await this.testAgents.isAgentUtilizingAgentUnits(AGENT_ID)).to.be.equal(false);

        const args = [AGENT_ID, 'Metadata2', [1, 3, 4, 5, 6], redundancy, shards];
        await expect(this.testAgents.connect(this.accounts.user1).updateAgent(...args)).to.be.revertedWith(`ValidMembershipRequired("${this.accounts.user1.address}")`);
    });

    it('isEnabled true - execution fees start, owner HAS valid key, bot IS updated to execution fees', async function () {
        await network.provider.send('evm_increaseTime', [1100]);
        await network.provider.send('evm_mine');

        expect(await this.testAgents.isEnabled(AGENT_ID)).to.be.equal(false);
        expect(await this.testAgents.isRegistered(AGENT_ID)).to.be.equal(true);
        expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
        expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
        expect(await this.testAgents.isAgentUtilizingAgentUnits(AGENT_ID)).to.be.equal(false);

        const individualKeyPrice = await this.individualLock.keyPrice();

        expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
        expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

        const txnReceipt = await this.individualLock.connect(this.accounts.user1).purchase(
            [individualKeyPrice],
            [this.accounts.user1.address],
            [this.accounts.user1.address],
            [ethers.constants.AddressZero],
            [[]],
            { gasLimit: 21000000 }
        );
        await txnReceipt.wait();

        expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
        expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
        expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);

        expect(await this.testAgents.isEnabled(AGENT_ID)).to.be.equal(false);
        expect(await this.testAgents.isRegistered(AGENT_ID)).to.be.equal(true);
        expect(await this.testAgents.isAgentUtilizingAgentUnits(AGENT_ID)).to.be.equal(false);

        await expect(this.testAgents.connect(this.accounts.user1).updateAgent(AGENT_ID, 'metadata2', [1, 3, 4, 5], redundancy, shards))
            .to.emit(this.testAgents, 'AgentOnExecutionFeesSystem')
            .withArgs(ethers.BigNumber.from(AGENT_ID));

        expect(await this.testAgents.isRegistered(AGENT_ID)).to.be.equal(true);
        expect(await this.testAgents.isAgentUtilizingAgentUnits(AGENT_ID)).to.be.equal(true);
        expect(await this.testAgents.isEnabled(AGENT_ID)).to.be.equal(true);
        expect(await this.testAgents.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
        expect(
            await this.testAgents
                .getAgent(AGENT_ID)
                .then((agent) => [agent.owner, agent.agentVersion.toNumber(), agent.metadata, agent.chainIds.map((chainId) => chainId.toNumber()), agent.redundancy, agent.shards])
        ).to.be.deep.equal([this.accounts.user1.address, 2, 'metadata2', [1, 3, 4, 5], redundancy, shards]);
        expect(await this.testAgents.getAgentCount()).to.be.equal('1');
        expect(await this.testAgents.getAgentCountByChain(1)).to.be.equal('1');
        expect(await this.testAgents.getAgentCountByChain(2)).to.be.equal('0');
        expect(await this.testAgents.getAgentCountByChain(3)).to.be.equal('1');
        expect(await this.testAgents.getAgentCountByChain(4)).to.be.equal('1');
        expect(await this.testAgents.getAgentCountByChain(5)).to.be.equal('1');
        expect(await this.testAgents.getAgentByIndex(0)).to.be.equal(AGENT_ID);
        expect(await this.testAgents.getAgentByChainAndIndex(1, 0)).to.be.equal(AGENT_ID);
        expect(await this.testAgents.getAgentByChainAndIndex(3, 0)).to.be.equal(AGENT_ID);
        expect(await this.testAgents.getAgentByChainAndIndex(4, 0)).to.be.equal(AGENT_ID);
        expect(await this.testAgents.getAgentByChainAndIndex(5, 0)).to.be.equal(AGENT_ID);
        expect(await this.botUnits.getOwnerActiveBotUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4, 5].length * redundancy * shards);
        expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits - ([1, 3, 4, 5].length * redundancy * shards));
    });
});
