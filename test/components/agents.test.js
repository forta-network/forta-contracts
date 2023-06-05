const { ethers, network } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');

const AGENT_ID = ethers.utils.hexlify(ethers.utils.randomBytes(32));
const redundancy = 6;
const shards = 10;

const prepareCommit = (...args) => ethers.utils.solidityKeccak256(['bytes32', 'address', 'string', 'uint256[]', 'uint8', 'uint8'], args);

describe('Agent Registry', function () {
    prepare({ stake: { agents: { min: '100', max: '500', activated: true } } });

    describe('create and update', function () {
        it('missing prepare if delay set', async function () {
            const args = [AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5], redundancy, shards];
            await expect(this.agents.connect(this.accounts.manager).setFrontRunningDelay('1800'))
                .to.emit(this.agents, 'FrontRunningDelaySet')
                .withArgs(ethers.BigNumber.from('1800'));
            await expect(this.agents.connect(this.accounts.user1).createAgent(...args)).to.be.revertedWith('CommitNotReady()');
        });

        describe('with prepare', async function () {
            beforeEach(async function () {
                await this.token.connect(this.accounts.user1).approve(this.individualLock.address, ethers.constants.MaxUint256);
                await this.token.connect(this.accounts.user1).approve(this.teamLock.address, ethers.constants.MaxUint256);
            });

            it('early', async function () {
                const args = [AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5], redundancy, shards];
                await expect(this.agents.connect(this.accounts.manager).setFrontRunningDelay('1800'))
                    .to.emit(this.agents, 'FrontRunningDelaySet')
                    .withArgs(ethers.BigNumber.from('1800'));

                await this.agents.prepareAgent(prepareCommit(...args));

                await expect(this.agents.connect(this.accounts.user1).createAgent(...args)).to.be.revertedWith('CommitNotReady()');
            });

            it('non existing agent', async function () {
                expect(
                    await this.agents
                        .getAgent(AGENT_ID)
                        .then((agent) => [agent.owner, agent.agentVersion.toNumber(), agent.metadata, agent.chainIds.map((chainId) => chainId.toNumber()), agent.redundancy, agent.shards])
                ).to.be.deep.equal([ethers.constants.AddressZero, 0, '', [], 0, 0]);
            });

            it('no delay', async function () {
                const args = [AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5], redundancy, shards];
                const individualKeyPrice = await this.individualLock.keyPrice();

                const txnReceipt = await this.individualLock.connect(this.accounts.user1).purchase(
                    [individualKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );
                await txnReceipt.wait();

                await expect(this.agents.connect(this.accounts.user1).createAgent(...args))
                    .to.emit(this.agents, 'Transfer')
                    .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5], redundancy, shards);
            });

            it('on time', async function () {
                const args = [AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5], redundancy, shards];
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

                const { blockNumber } = await this.agents.prepareAgent(prepareCommit(...args));
                const { timestamp } = await ethers.provider.getBlock(blockNumber);

                expect(await this.agents.getCommitTimestamp(prepareCommit(...args))).to.be.equal(timestamp);

                await network.provider.send('evm_increaseTime', [300]);

                const txnReceipt = await this.individualLock.connect(this.accounts.user1).purchase(
                    [individualKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );
                await txnReceipt.wait();

                await expect(this.agents.connect(this.accounts.user1).createAgent(...args))
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
                ).to.be.deep.equal([this.accounts.user1.address, 1, args[2], args[3], args[4], args[5]]);
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
            });

            it('unordered chainIds', async function () {
                const args = [AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 42, 3, 4, 5], redundancy, shards];

                const { blockNumber } = await this.agents.prepareAgent(prepareCommit(...args));
                const { timestamp } = await ethers.provider.getBlock(blockNumber);
                expect(await this.agents.getCommitTimestamp(prepareCommit(...args))).to.be.equal(timestamp);

                await network.provider.send('evm_increaseTime', [300]);

                await expect(this.agents.connect(this.accounts.user1).createAgent(...args)).to.be.revertedWith('UnorderedArray("chainIds")');
            });

            it('update', async function () {
                const args = [AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4], redundancy, shards];
                const individualKeyPrice = await this.individualLock.keyPrice();

                expect(await this.agents.getAgentCount()).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(1)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(2)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(3)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(4)).to.be.equal('0');
                expect(await this.agents.getAgentCountByChain(5)).to.be.equal('0');

                const { blockNumber } = await this.agents.prepareAgent(prepareCommit(...args));
                const { timestamp } = await ethers.provider.getBlock(blockNumber);
                expect(await this.agents.getCommitTimestamp(prepareCommit(...args))).to.be.equal(timestamp);

                await network.provider.send('evm_increaseTime', [300]);

                const txnReceipt = await this.individualLock.connect(this.accounts.user1).purchase(
                    [individualKeyPrice],
                    [this.accounts.user1.address],
                    [this.accounts.user1.address],
                    [ethers.constants.AddressZero],
                    [[]],
                    { gasLimit: 21000000 }
                );
                await txnReceipt.wait();

                await expect(this.agents.connect(this.accounts.user1).createAgent(...args))
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

                await expect(this.agents.connect(this.accounts.user1).updateAgent(AGENT_ID, 'Metadata2', [1, 4, 5], redundancy, shards))
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata2', [1, 4, 5], redundancy, shards);

                expect(await this.agents.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
                expect(
                    await this.agents
                        .getAgent(AGENT_ID)
                        .then((agent) => [agent.owner, agent.agentVersion.toNumber(), agent.metadata, agent.chainIds.map((chainId) => chainId.toNumber()), agent.redundancy, agent.shards])
                ).to.be.deep.equal([this.accounts.user1.address, 2, 'Metadata2', [1, 4, 5], redundancy, shards]);
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
            });
        });
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
            await this.token.connect(this.accounts.user1).approve(this.individualLock.address, ethers.constants.MaxUint256);
            await this.token.connect(this.accounts.user1).approve(this.teamLock.address, ethers.constants.MaxUint256);

            const args = [AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5], redundancy, shards];
            const individualKeyPrice = await this.individualLock.keyPrice();
            await expect(this.agents.prepareAgent(prepareCommit(...args))).to.be.not.reverted;
            await network.provider.send('evm_increaseTime', [300]);

            const txnReceipt = await this.individualLock.connect(this.accounts.user1).purchase(
                [individualKeyPrice],
                [this.accounts.user1.address],
                [this.accounts.user1.address],
                [ethers.constants.AddressZero],
                [[]],
                { gasLimit: 21000000 }
            );
            await txnReceipt.wait();

            await expect(this.agents.connect(this.accounts.user1).createAgent(...args)).to.be.not.reverted;
            await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.AGENT, AGENT_ID, '100');
        });

        // The new features of _Bot Execution Fees_ have made this test obsolete.
        // Need to research whether that side effect is diserable or not.
        it.skip('isEnabled is false for non registered agents, even if staked', async function () {
            const randomAgent = '123456789';
            await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.AGENT, randomAgent, '100');
            // Call to isEnabled with a "random" agentId is breaking because
            // it now fetches a given bot's owner
            expect(await this.agents.isEnabled(randomAgent)).to.be.equal(false);
        });

        describe('manager', async function () {
            it('disable', async function () {
                expect(await this.agents.getDisableFlags(AGENT_ID)).to.be.equal([0]);

                await expect(this.agents.connect(this.accounts.manager).disableAgent(AGENT_ID, 0)).to.emit(this.agents, 'AgentEnabled').withArgs(AGENT_ID, false, 0, false);

                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(false);
                expect(await this.agents.getDisableFlags(AGENT_ID)).to.be.equal([1]);
            });

            it('re-enable', async function () {
                await expect(this.agents.connect(this.accounts.manager).disableAgent(AGENT_ID, 0)).to.emit(this.agents, 'AgentEnabled').withArgs(AGENT_ID, false, 0, false);

                await expect(this.agents.connect(this.accounts.manager).enableAgent(AGENT_ID, 0)).to.emit(this.agents, 'AgentEnabled').withArgs(AGENT_ID, true, 0, true);

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
                expect(await this.agents.getDisableFlags(AGENT_ID)).to.be.equal([2]);

                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(false);
            });

            it('re-enable', async function () {
                await expect(this.agents.connect(this.accounts.user1).disableAgent(AGENT_ID, 1)).to.emit(this.agents, 'AgentEnabled').withArgs(AGENT_ID, false, 1, false);

                await expect(this.agents.connect(this.accounts.user1).enableAgent(AGENT_ID, 1)).to.emit(this.agents, 'AgentEnabled').withArgs(AGENT_ID, true, 1, true);

                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(true);
            });

            it('restricted', async function () {
                await expect(this.agents.connect(this.accounts.other).disableAgent(AGENT_ID, 1)).to.be.reverted;
            });
        });

        describe('hybrid', async function () {
            it('owner cannot re-enable after admin disable', async function () {
                await expect(this.agents.connect(this.accounts.manager).disableAgent(AGENT_ID, 0)).to.emit(this.agents, 'AgentEnabled').withArgs(AGENT_ID, false, 0, false);

                await expect(this.agents.connect(this.accounts.user1).enableAgent(AGENT_ID, 1)).to.emit(this.agents, 'AgentEnabled').withArgs(AGENT_ID, false, 1, true);

                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(false);
            });

            it('admin cannot re-enable after owner disable', async function () {
                await expect(this.agents.connect(this.accounts.user1).disableAgent(AGENT_ID, 1)).to.emit(this.agents, 'AgentEnabled').withArgs(AGENT_ID, false, 1, false);

                await expect(this.agents.connect(this.accounts.manager).enableAgent(AGENT_ID, 0)).to.emit(this.agents, 'AgentEnabled').withArgs(AGENT_ID, false, 0, true);

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
});
