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
        .to.be.revertedWith('Agent commitment is not ready');
    });

    describe('with prepare', async function () {
      it('early', async function () {
        const args = [ AGENT_ID, this.accounts.user1.address, 'Metadata1', [ 1 , 3, 4, 5 ] ];

        const tx       = await this.registry.agents.prepareAgent(prepareCommit(...args));
        const deadline = await txTimestamp(tx) + 300;
        await expect(tx)
        .to.emit(this.registry.agents, 'AgentCommitted').withArgs(prepareCommit(...args), deadline);

        await expect(this.registry.agents.createAgent(...args))
        .to.be.revertedWith('Agent commitment is not ready');
      });

      it('on time', async function () {
        const args = [ AGENT_ID, this.accounts.user1.address, 'Metadata1', [ 1 , 3, 4, 5 ] ];

        const tx       = await this.registry.agents.prepareAgent(prepareCommit(...args));
        const deadline = await txTimestamp(tx) + 300;
        await expect(tx)
        .to.emit(this.registry.agents, 'AgentCommitted').withArgs(prepareCommit(...args), deadline);

        await network.provider.send('evm_increaseTime', [ 300 ]);

        await expect(this.registry.agents.createAgent(...args))
        .to.emit(this.registry.agents, 'Transfer').withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
        .to.emit(this.registry.agents, 'AgentUpdated').withArgs(AGENT_ID, 'Metadata1', [ 1 , 3, 4, 5 ]);

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

        const tx       = await this.registry.agents.prepareAgent(prepareCommit(...args));
        const deadline = await txTimestamp(tx) + 300;
        await expect(tx)
        .to.emit(this.registry.agents, 'AgentCommitted').withArgs(prepareCommit(...args), deadline);

        await network.provider.send('evm_increaseTime', [ 300 ]);

        await expect(this.registry.agents.createAgent(...args))
        .to.be.revertedWith('Values must be sorted');
      });

      it.only('update', async function () {
        const args = [ AGENT_ID, this.accounts.user1.address, 'Metadata1', [ 1, 3, 4 ] ];

        const tx       = await this.registry.agents.prepareAgent(prepareCommit(...args));
        const deadline = await txTimestamp(tx) + 300;
        await expect(tx)
        .to.emit(this.registry.agents, 'AgentCommitted').withArgs(prepareCommit(...args), deadline);

        await network.provider.send('evm_increaseTime', [ 300 ]);

        await expect(this.registry.agents.createAgent(...args))
        .to.emit(this.registry.agents, 'Transfer').withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
        .to.emit(this.registry.agents, 'AgentUpdated').withArgs(AGENT_ID, 'Metadata1', [ 1 , 3, 4 ]);

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

  // describe('mint', function () {
  //   describe('non-authorized', function () {
  //     it('to non-whitelisted', async function () {
  //       await expect(this.token.connect(this.accounts.whitelister).mint(this.accounts.nonwhitelist.address, 1))
  //         .to.be.revertedWith(`AccessControl: account ${this.accounts.whitelister.address.toLowerCase()} is missing role ${this.roles.MINTER}`);
  //     });

  //     it('to whitelisted', async function () {
  //       await expect(this.token.connect(this.accounts.whitelister).mint(this.accounts.whitelist.address, 1))
  //         .to.be.revertedWith(`AccessControl: account ${this.accounts.whitelister.address.toLowerCase()} is missing role ${this.roles.MINTER}`);
  //     });
  //   });

  //   describe('non-authorized', function () {
  //     it('to non-whitelisted', async function () {
  //       await expect(this.token.connect(this.accounts.minter).mint(this.accounts.nonwhitelist.address, 1))
  //         .to.be.revertedWith(`Forta: receiver is not whitelisted`);
  //     });

  //     it('to whitelisted', async function () {
  //       await expect(this.token.connect(this.accounts.minter).mint(this.accounts.whitelist.address, 1))
  //         .to.emit(this.token, 'Transfer')
  //         .withArgs(ethers.constants.AddressZero, this.accounts.whitelist.address, 1);
  //     });
  //   });
  // });

});
