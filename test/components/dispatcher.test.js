const { ethers } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');
const { BigNumber } = require('@ethersproject/bignumber')


describe('Dispatcher', function () {
  prepare({ minStake: '100' });

  beforeEach(async function () {
    this.accounts.getAccount('scanner');
    this.SCANNER_ID = this.accounts.scanner.address;
    this.AGENT_ID   = ethers.utils.hexlify(ethers.utils.randomBytes(32));
    this.SCANNER_SUBJECT_ID = BigNumber.from(this.SCANNER_ID);
    await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.SCANNER_SUBJECT_TYPE, this.SCANNER_SUBJECT_ID, '100');
    await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.AGENT_SUBJECT_TYPE, this.AGENT_ID, '100');
    await expect(this.agents.createAgent(this.AGENT_ID, this.accounts.user1.address, 'Metadata1', [ 1 , 3, 4, 5 ])).to.be.not.reverted
    await expect(this.agents.connect(this.accounts.manager).enableAgent(this.AGENT_ID, 0)).to.be.not.reverted
    await this.scanners.connect(this.accounts.manager).adminRegister(this.SCANNER_ID, this.accounts.user1.address, 1, 'metadata');
    
  });

  it('protected', async function () {
    await expect(this.dispatch.connect(this.accounts.user1).link(this.AGENT_ID, this.SCANNER_ID))
    .to.be.revertedWith(`MissingRole("${this.roles.DISPATCHER}", "${this.accounts.user1.address}")`)
  });

  it('link', async function () {
    const hashBefore = await this.dispatch.scannerHash(this.SCANNER_ID);

    await expect(this.dispatch.connect(this.accounts.manager).link(this.AGENT_ID, this.SCANNER_ID))
    .to.emit(this.dispatch, 'Link').withArgs(this.AGENT_ID, this.SCANNER_ID, true);

    expect(await this.dispatch.scannerHash(this.SCANNER_ID)).to.not.be.deep.equal(hashBefore);
  });

  it('link fails if scanner not staked over minimum', async function () {
    await this.staking.connect(this.accounts.admin).setMinStake(this.stakingSubjects.SCANNER_SUBJECT_TYPE, '10000');
    await expect(this.dispatch.connect(this.accounts.manager).link(this.AGENT_ID, this.SCANNER_ID))
    .to.be.revertedWith('Dispatch: Scanner disabled')
  });

  it('link fails if scanner is disabled', async function () {
    await this.scanners.connect(this.accounts.user1).disableScanner(this.SCANNER_ID, 2);
    await expect(this.dispatch.connect(this.accounts.manager).link(this.AGENT_ID, this.SCANNER_ID))
    .to.be.revertedWith('Dispatch: Scanner disabled')
  });

  it('link fails if agent not staked over minimum', async function () {
    await this.staking.connect(this.accounts.admin).setMinStake(this.stakingSubjects.AGENT_SUBJECT_TYPE, '10000');
    await expect(this.dispatch.connect(this.accounts.manager).link(this.AGENT_ID, this.SCANNER_ID))
    .to.be.revertedWith('Dispatch: Agent disabled')
  });

  it('link fails if agent is disabled', async function () {
    await this.agents.connect(this.accounts.user1).disableAgent(this.AGENT_ID, 1);
    await expect(this.dispatch.connect(this.accounts.manager).link(this.AGENT_ID, this.SCANNER_ID))
    .to.be.revertedWith('Dispatch: Agent disabled')
  });

  it('unlink', async function () {
    const hashBefore = await this.dispatch.scannerHash(this.SCANNER_ID);

    await expect(this.dispatch.connect(this.accounts.manager).link(this.AGENT_ID, this.SCANNER_ID))
    .to.emit(this.dispatch, 'Link').withArgs(this.AGENT_ID, this.SCANNER_ID, true);
    await expect(this.dispatch.connect(this.accounts.manager).unlink(this.AGENT_ID, this.SCANNER_ID))
    .to.emit(this.dispatch, 'Link').withArgs(this.AGENT_ID, this.SCANNER_ID, false);

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

    await expect(this.agents.connect(this.accounts.user1).updateAgent(this.AGENT_ID, 'Metadata2', [ 1 ])).to.be.not.reverted;

    expect(await this.dispatch.scannerHash(this.SCANNER_ID)).to.not.be.deep.equal(hashBefore);
  });

  it.skip('gas estimation', async function () {
    for (const i in Array(10).fill()) {
      for (const j in Array(10).fill()) {
        const agent   = ethers.utils.hexlify(ethers.utils.randomBytes(32));
        await expect(this.agents.createAgent(agent, this.accounts.user1.address, `Agent ${i*10+j}`, [ 1 ])).to.be.not.reverted
        await expect(this.dispatch.connect(this.accounts.manager).link(agent, this.SCANNER_ID)).to.be.not.reverted;
      }

      await Promise.all([
        this.dispatch.agentsFor(this.SCANNER_ID),
        this.dispatch.estimateGas.scannerHash(this.SCANNER_ID),
      ]).then(([ count, cost ]) => console.log(`scannerHash gas cost with ${count.toString()} agents: ${cost.toString()}`));
    }
  });

  
});
