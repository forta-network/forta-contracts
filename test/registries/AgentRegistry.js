const { ethers } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');


const AGENT_ID = ethers.utils.hexlify(ethers.utils.randomBytes(32));


const txTimestamp = (tx) => tx.wait().then(({ blockNumber }) => ethers.provider.getBlock(blockNumber)).then(({ timestamp }) => timestamp);
const prepareCommit = (...args)  => ethers.utils.solidityKeccak256([ 'bytes32', 'address', 'string', 'uint256[]' ], args);


describe('Forta', function () {
  prepare();

  describe('create and update', function () {
    it('missing prepare', async function () {
      const args = [ AGENT_ID, this.accounts.user1.address, 'Metadata1', [ 1 , 3, 4, 5 ] ];

      await expect(this.registry.agents.createAgent(...args))
        .to.be.revertedWith('Commit not ready');
    });

    describe('with prepare', async function () {
      it('early', async function () {
        const args = [ AGENT_ID, this.accounts.user1.address, 'Metadata1', [ 1 , 3, 4, 5 ] ];

        await expect(this.registry.agents.prepareAgent(prepareCommit(...args)))
        .to.emit(this.registry.agents, 'AgentCommitted').withArgs(prepareCommit(...args));

        await expect(this.registry.agents.createAgent(...args))
        .to.be.revertedWith('Commit not ready');
      });

      it('on time', async function () {
        const args = [ AGENT_ID, this.accounts.user1.address, 'Metadata1', [ 1 , 3, 4, 5 ] ];

        await expect(this.registry.agents.prepareAgent(prepareCommit(...args)))
        .to.emit(this.registry.agents, 'AgentCommitted').withArgs(prepareCommit(...args));

        await network.provider.send('evm_increaseTime', [ 300 ]);

        await expect(this.registry.agents.createAgent(...args))
        .to.emit(this.registry.agents, 'Transfer').withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
        .to.emit(this.registry.agents, 'AgentUpdated').withArgs(AGENT_ID, 'Metadata1', [ 1 , 3, 4, 5 ]);

        expect(await this.registry.agents.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
        expect(await this.registry.agents.getAgent(AGENT_ID).then(agent => [
          agent.version.toNumber(),
          agent.metadata,
          agent.chainIds.map(chainId => chainId.toNumber()),
        ])).to.be.deep.equal([
          1,
          args[2],
          args[3],
        ]);
        expect(await this.registry.agents.getAgentCountByChain(1)).to.be.equal('1');
        expect(await this.registry.agents.getAgentCountByChain(2)).to.be.equal('0');
        expect(await this.registry.agents.getAgentCountByChain(3)).to.be.equal('1');
        expect(await this.registry.agents.getAgentCountByChain(4)).to.be.equal('1');
        expect(await this.registry.agents.getAgentCountByChain(5)).to.be.equal('1');
      });

      it('unordered chainID', async function () {
        const args = [ AGENT_ID, this.accounts.user1.address, 'Metadata1', [ 1, 42, 3, 4, 5 ] ];

        await expect(this.registry.agents.prepareAgent(prepareCommit(...args)))
        .to.emit(this.registry.agents, 'AgentCommitted').withArgs(prepareCommit(...args));

        await network.provider.send('evm_increaseTime', [ 300 ]);

        await expect(this.registry.agents.createAgent(...args))
        .to.be.revertedWith('Values must be sorted');
      });

      it('update', async function () {
        const args = [ AGENT_ID, this.accounts.user1.address, 'Metadata1', [ 1, 3, 4 ] ];

        await expect(this.registry.agents.prepareAgent(prepareCommit(...args)))
        .to.emit(this.registry.agents, 'AgentCommitted').withArgs(prepareCommit(...args));

        await network.provider.send('evm_increaseTime', [ 300 ]);

        await expect(this.registry.agents.createAgent(...args))
        .to.emit(this.registry.agents, 'Transfer').withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
        .to.emit(this.registry.agents, 'AgentUpdated').withArgs(AGENT_ID, 'Metadata1', [ 1 , 3, 4 ]);

        expect(await this.registry.agents.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
        expect(await this.registry.agents.getAgent(AGENT_ID).then(agent => [
          agent.version.toNumber(),
          agent.metadata,
          agent.chainIds.map(chainId => chainId.toNumber()),
        ])).to.be.deep.equal([
          1,
          'Metadata1',
          [ 1, 3, 4 ],
        ]);
        expect(await this.registry.agents.getAgentCountByChain(1)).to.be.equal('1');
        expect(await this.registry.agents.getAgentCountByChain(2)).to.be.equal('0');
        expect(await this.registry.agents.getAgentCountByChain(3)).to.be.equal('1');
        expect(await this.registry.agents.getAgentCountByChain(4)).to.be.equal('1');
        expect(await this.registry.agents.getAgentCountByChain(5)).to.be.equal('0');

        await expect(this.registry.agents.connect(this.accounts.user1).updateAgent(AGENT_ID, 'Metadata2', [ 1, 4, 5 ]))
        .to.emit(this.registry.agents, 'AgentUpdated').withArgs(AGENT_ID, 'Metadata2', [ 1, 4, 5 ]);

        expect(await this.registry.agents.ownerOf(AGENT_ID)).to.be.equal(this.accounts.user1.address);
        expect(await this.registry.agents.getAgent(AGENT_ID).then(agent => [
          agent.version.toNumber(),
          agent.metadata,
          agent.chainIds.map(chainId => chainId.toNumber()),
        ])).to.be.deep.equal([
          2,
          'Metadata2',
          [ 1, 4, 5 ],
        ]);
        expect(await this.registry.agents.getAgentCountByChain(1)).to.be.equal('1');
        expect(await this.registry.agents.getAgentCountByChain(2)).to.be.equal('0');
        expect(await this.registry.agents.getAgentCountByChain(3)).to.be.equal('0');
        expect(await this.registry.agents.getAgentCountByChain(4)).to.be.equal('1');
        expect(await this.registry.agents.getAgentCountByChain(5)).to.be.equal('1');
      });
    });
  });

  describe('enable and disable', async function () {
    beforeEach(async function () {
      const args = [ AGENT_ID, this.accounts.user1.address, 'Metadata1', [ 1 , 3, 4, 5 ] ];
      await expect(this.registry.agents.prepareAgent(prepareCommit(...args))).to.be.not.reverted;
      await network.provider.send('evm_increaseTime', [ 300 ]);
      await expect(this.registry.agents.createAgent(...args)).to.be.not.reverted;
    });

    describe('manager', async function () {
      it('disable', async function () {
        await expect(this.registry.agents.connect(this.accounts.manager).disableAgent(AGENT_ID, 0))
        .to.emit(this.registry.agents, 'AgentEnabled').withArgs(AGENT_ID, 0, false);

        expect(await this.registry.agents.isEnabled(AGENT_ID)).to.be.equal(false);
      });

      it('re-enable', async function () {
        await expect(this.registry.agents.connect(this.accounts.manager).disableAgent(AGENT_ID, 0))
        .to.emit(this.registry.agents, 'AgentEnabled').withArgs(AGENT_ID, 0, false);

        await expect(this.registry.agents.connect(this.accounts.manager).enableAgent(AGENT_ID, 0))
        .to.emit(this.registry.agents, 'AgentEnabled').withArgs(AGENT_ID, 0, true);

        expect(await this.registry.agents.isEnabled(AGENT_ID)).to.be.equal(true);
      });

      it('restricted', async function () {
        await expect(this.registry.agents.connect(this.accounts.other).disableAgent(AGENT_ID, 0)).to.be.reverted;
      });
    });

    describe('owner', async function () {
      it('disable', async function () {
        await expect(this.registry.agents.connect(this.accounts.user1).disableAgent(AGENT_ID, 1))
        .to.emit(this.registry.agents, 'AgentEnabled').withArgs(AGENT_ID, 1, false);

        expect(await this.registry.agents.isEnabled(AGENT_ID)).to.be.equal(false);
      });

      it('re-enable', async function () {
        await expect(this.registry.agents.connect(this.accounts.user1).disableAgent(AGENT_ID, 1))
        .to.emit(this.registry.agents, 'AgentEnabled').withArgs(AGENT_ID, 1, false);

        await expect(this.registry.agents.connect(this.accounts.user1).enableAgent(AGENT_ID, 1))
        .to.emit(this.registry.agents, 'AgentEnabled').withArgs(AGENT_ID, 1, true);

        expect(await this.registry.agents.isEnabled(AGENT_ID)).to.be.equal(true);
      });

      it('restricted', async function () {
        await expect(this.registry.agents.connect(this.accounts.other).disableAgent(AGENT_ID, 0)).to.be.reverted;
      });
    });

    describe('hybrid', async function () {
      it('owner cannot reenable after admin disable', async function () {
        await expect(this.registry.agents.connect(this.accounts.manager).disableAgent(AGENT_ID, 0))
        .to.emit(this.registry.agents, 'AgentEnabled').withArgs(AGENT_ID, 0, false);

        await expect(this.registry.agents.connect(this.accounts.user1).enableAgent(AGENT_ID, 1))
        .to.emit(this.registry.agents, 'AgentEnabled').withArgs(AGENT_ID, 1, true);

        expect(await this.registry.agents.isEnabled(AGENT_ID)).to.be.equal(false);
      });

      it('admin cannot reenable after owner disable', async function () {
        await expect(this.registry.agents.connect(this.accounts.user1).disableAgent(AGENT_ID, 1))
        .to.emit(this.registry.agents, 'AgentEnabled').withArgs(AGENT_ID, 1, false);

        await expect(this.registry.agents.connect(this.accounts.manager).enableAgent(AGENT_ID, 0))
        .to.emit(this.registry.agents, 'AgentEnabled').withArgs(AGENT_ID, 0, true);

        expect(await this.registry.agents.isEnabled(AGENT_ID)).to.be.equal(false);
      });
    });
  });

});
