const { ethers } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');
const { BigNumber } = require('@ethersproject/bignumber')

describe('Forwarder', function () {
  prepare()

  describe('forward transactions', async function () {

    let domain, types, forwardRequest, grantee
    before(async function() {
      const { chainId } = await ethers.provider.getNetwork()

      domain = {
        name: 'Forwarder',
        version: '1',
        chainId: chainId,
        verifyingContract: this.contracts.forwarder.address
      }
      types = {
        ForwardRequest: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'gas', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
          { name: 'data', type: 'bytes' }
        ],
      }
      grantee = ethers.Wallet.createRandom()
    })
    it('forwards correctly', async function () {
      // Gas the relayer will forward to the external contract to execute grantRole. Tx gasLimit is estimated by ethers.js
      const gas = await this.contracts.access.estimateGas.grantRole(this.roles.SCANNER_ADMIN, grantee.address)
      const { data } = await this.contracts.access.populateTransaction.grantRole(this.roles.SCANNER_ADMIN, grantee.address)
      const { timestamp } = await ethers.provider.getBlock('latest')
      forwardRequest =  {
        from: this.accounts.admin.address,
        to: this.contracts.access.address,
        value: 0,
        gas: gas,
        nonce: 0,
        deadline: timestamp + 10000,
        data: data,
      }
      const signature = await this.accounts.admin._signTypedData(domain, types, forwardRequest)
      expect(await this.contracts.forwarder.connect(this.accounts.admin).execute(forwardRequest, signature))
      .to.emit(this.contracts.access, 'RoleGranted')
    });

    it('fails if deadline is already passed', async function () {
      // Gas the relayer will forward to the external contract to execute grantRole. Tx gasLimit is estimated by ethers.js
      const gas = await this.contracts.access.estimateGas.grantRole(this.roles.SCANNER_ADMIN, grantee.address)
      const { data } = await this.contracts.access.populateTransaction.grantRole(this.roles.SCANNER_ADMIN, grantee.address)
      const { timestamp } = await ethers.provider.getBlock('latest')
      forwardRequest =  {
        from: this.accounts.admin.address,
        to: this.contracts.access.address,
        value: 0,
        gas: gas,
        nonce: 0,
        deadline: timestamp - 10000,
        data: data,
      }
      const signature = await this.accounts.admin._signTypedData(domain, types, forwardRequest)
      await expect(this.contracts.forwarder.connect(this.accounts.admin).execute(forwardRequest, signature))
      .to.be.revertedWith('Forwarder: deadline expired')
    });

    it('fails if there is signature mismatch', async function () {
      // Gas the relayer will forward to the external contract to execute grantRole. Tx gasLimit is estimated by ethers.js
      const gas = await this.contracts.access.estimateGas.grantRole(this.roles.SCANNER_ADMIN, grantee.address)
      const { data } = await this.contracts.access.populateTransaction.grantRole(this.roles.SCANNER_ADMIN, grantee.address)
      const { timestamp } = await ethers.provider.getBlock('latest')
      forwardRequest =  {
        from: this.accounts.admin.address,
        to: this.contracts.access.address,
        value: 0,
        gas: gas,
        nonce: 0,
        deadline: timestamp + 10000,
        data: data,
      }
      const differentForwardRequest = {...forwardRequest }
      differentForwardRequest.value = 1
      const diffSignature = await this.accounts.admin._signTypedData(domain, types, differentForwardRequest)
      await expect(this.contracts.forwarder.connect(this.accounts.admin).execute(forwardRequest, diffSignature))
      .to.be.revertedWith('Forwarder: signature does not match request')
    });
    
    it('consumes all gas on failure', async function () {
      const gasCallee = await this.contracts.access.estimateGas.grantRole(this.roles.SCANNER_ADMIN, grantee.address)
      const { data } = await this.contracts.access.populateTransaction.grantRole(this.roles.SCANNER_ADMIN, grantee.address)
      const { timestamp } = await ethers.provider.getBlock('latest')
      forwardRequest =  {
        from: this.accounts.admin.address,
        to: this.contracts.access.address,
        value: 0,
        gas: gasCallee,
        nonce: 0,
        deadline: timestamp + 10000,
        data: data,
      }

      const signature = await this.accounts.admin._signTypedData(domain, types, forwardRequest)
      const gasCallerCallee = await this.contracts.forwarder.connect(this.accounts.admin).estimateGas.execute(forwardRequest, signature)
      const notEnoughGasForCallee = gasCallerCallee.sub(gasCallee.div(64))
      // To check for thrown exceptions for invalid opcodes, waffle checks that the error message
      // returned by rpc includes 'error' and revertReason.
      // If not, it considers you check for thrown 'invalid opcode' if you don't pass a revertReason
      // https://github.com/EthWorks/Waffle/blob/3f46a6c8093cb9edb1a68c3ba15c4b4499ad595d/waffle-chai/src/matchers/revertedWith.ts#L32
      await expect( this.contracts.forwarder.connect(this.accounts.admin).execute(forwardRequest, signature, { gasLimit: notEnoughGasForCallee }))
      .to.be.revertedWith('');
    });
  });
});
