const { ethers } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');


const txTimestamp = (tx) => tx.wait().then(({ blockNumber }) => ethers.provider.getBlock(blockNumber)).then(({ timestamp }) => timestamp);
const prepareCommit = (...args)  => ethers.utils.solidityKeccak256([ 'bytes32', 'address', 'string', 'uint256[]' ], args);
const getScannerSubjectId = (tx) => tx.wait().then(({ events }) => events.find(x => x.event === 'Transfer').args.tokenId);

const SCANNER_SUBJECT_TYPE = 0;
const AGENT_SUBJECT_TYPE = 1;

describe('Dispatcher', function () {
  prepare();

  beforeEach(async function () {
    this.accounts.getAccount('scanner');
    this.SCANNER_ID = this.accounts.scanner.address;
    this.AGENT_ID   = ethers.utils.hexlify(ethers.utils.randomBytes(32));
    await expect(this.agents.createAgent(this.AGENT_ID, this.accounts.user1.address, 'Metadata1', [ 1 , 3, 4, 5 ])).to.be.not.reverted
    const tx = await this.scanners.connect(this.accounts.manager).adminRegister(this.SCANNER_ID, this.accounts.user1.address, 1)
    SCANNER_SUBJECT_ID = await getScannerSubjectId(tx)
    await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.user1.address);
    await this.token.connect(this.accounts.minter).mint(this.accounts.user1.address, ethers.utils.parseEther('1000'));
    await this.token.connect(this.accounts.user1).approve(this.staking.address, ethers.constants.MaxUint256);
    await this.staking.connect(this.accounts.admin).setMinStake(SCANNER_SUBJECT_TYPE, '100');
    await this.staking.connect(this.accounts.user1).deposit(SCANNER_SUBJECT_TYPE, SCANNER_SUBJECT_ID, '100');
    await this.staking.connect(this.accounts.admin).setMinStake(AGENT_SUBJECT_TYPE, '100');
    await this.staking.connect(this.accounts.user1).deposit(AGENT_SUBJECT_TYPE, this.AGENT_ID, '100');
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
    await this.staking.connect(this.accounts.admin).setMinStake(SCANNER_SUBJECT_TYPE, '10000');
    await expect(this.dispatch.connect(this.accounts.manager).link(this.AGENT_ID, this.SCANNER_ID))
    .to.be.revertedWith('Dispatch: Scanner is not staked over minimum')
  });

  it('link fails if agent not staked over minimum', async function () {
    await this.staking.connect(this.accounts.admin).setMinStake(AGENT_SUBJECT_TYPE, '10000');
    await expect(this.dispatch.connect(this.accounts.manager).link(this.AGENT_ID, this.SCANNER_ID))
    .to.be.revertedWith('Dispatch: Agent is not staked over minimum')
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
