const { ethers } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');
const { BigNumber } = require('@ethersproject/bignumber');

describe('Dispatcher', function () {
    prepare({ stake: { min: '100', max: '500', activated: true } });

    beforeEach(async function () {
        this.accounts.getAccount('scanner');
        this.SCANNER_ID = this.accounts.scanner.address;
        this.AGENT_ID = ethers.utils.hexlify(ethers.utils.randomBytes(32));
        this.SCANNER_SUBJECT_ID = BigNumber.from(this.SCANNER_ID);
        // Create Agent and Scanner
        await this.agents.createAgent(this.AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5]);
        await this.scanners.connect(this.accounts.manager).adminRegister(this.SCANNER_ID, this.accounts.user1.address, 1, 'metadata');
        // Stake
        await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.SCANNER_SUBJECT_TYPE, this.SCANNER_SUBJECT_ID, '100');
        await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.AGENT_SUBJECT_TYPE, this.AGENT_ID, '100');
    });

    it('protected', async function () {
        await expect(this.dispatch.connect(this.accounts.user1).link(this.AGENT_ID, this.SCANNER_ID)).to.be.revertedWith(
            `MissingRole("${this.roles.DISPATCHER}", "${this.accounts.user1.address}")`
        );
    });

    it('link', async function () {
        const hashBefore = await this.dispatch.scannerHash(this.SCANNER_ID);
        expect(await this.scanners.isStakedOverMin(this.SCANNER_ID)).to.be.equal(true);
        expect(await this.dispatch.areTheyLinked(this.AGENT_ID, this.SCANNER_ID)).to.be.equal(false);
        await expect(this.dispatch.connect(this.accounts.manager).link(this.AGENT_ID, this.SCANNER_ID))
            .to.emit(this.dispatch, 'Link')
            .withArgs(this.AGENT_ID, this.SCANNER_ID, true);
        expect(await this.dispatch.areTheyLinked(this.AGENT_ID, this.SCANNER_ID)).to.be.equal(true);

        expect(await this.dispatch.scannerHash(this.SCANNER_ID)).to.not.be.deep.equal(hashBefore);
    });

    it('link fails if scanner not staked over minimum', async function () {
        await this.scanners.connect(this.accounts.manager).setStakeThreshold({ max: '100000', min: '10000', activated: true }, 1);
        await expect(this.dispatch.connect(this.accounts.manager).link(this.AGENT_ID, this.SCANNER_ID)).to.be.revertedWith('Disabled("Scanner")');
    });

    it('link fails if scanner is disabled', async function () {
        await this.scanners.connect(this.accounts.user1).disableScanner(this.SCANNER_ID, 2);
        await expect(this.dispatch.connect(this.accounts.manager).link(this.AGENT_ID, this.SCANNER_ID)).to.be.revertedWith('Disabled("Scanner")');
    });

    it('link fails if agent not staked over minimum', async function () {
        await this.agents.connect(this.accounts.manager).setStakeThreshold({ max: '100000', min: '10000', activated: true });
        await expect(this.dispatch.connect(this.accounts.manager).link(this.AGENT_ID, this.SCANNER_ID)).to.be.revertedWith('Disabled("Agent")');
    });

    it('link fails if agent is disabled', async function () {
        await this.agents.connect(this.accounts.user1).disableAgent(this.AGENT_ID, 1);
        await expect(this.dispatch.connect(this.accounts.manager).link(this.AGENT_ID, this.SCANNER_ID)).to.be.revertedWith('Disabled("Agent")');
    });

    it('unlink', async function () {
        const hashBefore = await this.dispatch.scannerHash(this.SCANNER_ID);

        await expect(this.dispatch.connect(this.accounts.manager).link(this.AGENT_ID, this.SCANNER_ID))
            .to.emit(this.dispatch, 'Link')
            .withArgs(this.AGENT_ID, this.SCANNER_ID, true);
        expect(await this.dispatch.areTheyLinked(this.AGENT_ID, this.SCANNER_ID)).to.be.equal(true);

        await expect(this.dispatch.connect(this.accounts.manager).unlink(this.AGENT_ID, this.SCANNER_ID))
            .to.emit(this.dispatch, 'Link')
            .withArgs(this.AGENT_ID, this.SCANNER_ID, false);
        expect(await this.dispatch.areTheyLinked(this.AGENT_ID, this.SCANNER_ID)).to.be.equal(false);

        expect(await this.dispatch.scannerHash(this.SCANNER_ID)).to.be.deep.equal(hashBefore);
    });

    it('agent disable', async function () {
        await expect(this.dispatch.connect(this.accounts.manager).link(this.AGENT_ID, this.SCANNER_ID)).to.be.not.reverted;

        const hashBefore = await this.dispatch.scannerHash(this.SCANNER_ID);

        await expect(this.agents.connect(this.accounts.user1).disableAgent(this.AGENT_ID, 1)).to.be.not.reverted;

        expect(await this.dispatch.scannerHash(this.SCANNER_ID)).to.not.be.deep.equal(hashBefore);
    });

    it('agent re-enable', async function () {
        await expect(this.dispatch.connect(this.accounts.manager).link(this.AGENT_ID, this.SCANNER_ID)).to.be.not.reverted;

        const hashBefore = await this.dispatch.scannerHash(this.SCANNER_ID);

        await expect(this.agents.connect(this.accounts.user1).disableAgent(this.AGENT_ID, 1)).to.be.not.reverted;
        await expect(this.agents.connect(this.accounts.user1).enableAgent(this.AGENT_ID, 1)).to.be.not.reverted;

        expect(await this.dispatch.scannerHash(this.SCANNER_ID)).to.be.deep.equal(hashBefore);
    });

    it('update', async function () {
        await expect(this.dispatch.connect(this.accounts.manager).link(this.AGENT_ID, this.SCANNER_ID)).to.be.not.reverted;

        const hashBefore = await this.dispatch.scannerHash(this.SCANNER_ID);

        await expect(this.agents.connect(this.accounts.user1).updateAgent(this.AGENT_ID, 'Metadata2', [1])).to.be.not.reverted;

        expect(await this.dispatch.scannerHash(this.SCANNER_ID)).to.not.be.deep.equal(hashBefore);
    });

    it('agentAt', async function () {
        expect(this.dispatch.connect(this.accounts.manager).link(this.AGENT_ID, this.SCANNER_ID)).to.emit(this.dispatch, 'Link').withArgs(this.AGENT_ID, this.SCANNER_ID, true);

        expect(await this.dispatch.agentAt(this.SCANNER_ID, 0)).to.be.equal(this.AGENT_ID);
    });

    it('agentRefAt', async function () {
        await expect(this.dispatch.connect(this.accounts.manager).link(this.AGENT_ID, this.SCANNER_ID)).to.be.not.reverted;

        const expected = [
            true,
            this.accounts.user1.address,
            BigNumber.from(this.AGENT_ID),
            BigNumber.from(1),
            'Metadata1',
            [BigNumber.from(1), BigNumber.from(3), BigNumber.from(4), BigNumber.from(5)],
            true,
        ];
        expect(await this.dispatch.agentRefAt(this.SCANNER_ID, 0)).to.be.deep.equal(expected);
    });

    it('scannerAt', async function () {
        expect(this.dispatch.connect(this.accounts.manager).link(this.AGENT_ID, this.SCANNER_ID)).to.emit(this.dispatch, 'Link').withArgs(this.AGENT_ID, this.SCANNER_ID, true);

        expect(await this.dispatch.scannerAt(this.AGENT_ID, 0)).to.be.equal(this.SCANNER_ID);
    });

    it('scannerRefAt', async function () {
        await expect(this.dispatch.connect(this.accounts.manager).link(this.AGENT_ID, this.SCANNER_ID)).to.be.not.reverted;
        const expected = [true, BigNumber.from(this.SCANNER_ID.toLowerCase()), this.accounts.user1.address, BigNumber.from(1), 'metadata', true];
        expect(await this.dispatch.scannerRefAt(this.AGENT_ID, 0)).to.be.deep.equal(expected);
    });

    it.skip('gas estimation', async function () {
        for (const i in Array(10).fill()) {
            for (const j in Array(10).fill()) {
                const agent = ethers.utils.hexlify(ethers.utils.randomBytes(32));
                await expect(this.agents.createAgent(agent, this.accounts.user1.address, `Agent ${i * 10 + j}`, [1])).to.be.not.reverted;
                await expect(this.dispatch.connect(this.accounts.manager).link(agent, this.SCANNER_ID)).to.be.not.reverted;
            }

            await Promise.all([this.dispatch.numAgentsFor(this.SCANNER_ID), this.dispatch.estimateGas.scannerHash(this.SCANNER_ID)]).then(([count, cost]) =>
                console.log(`scannerHash gas cost with ${count.toString()} agents: ${cost.toString()}`)
            );
        }
    });
});
