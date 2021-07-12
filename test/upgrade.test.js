const { ethers } = require('hardhat');
const { expect } = require('chai');
const { attach, prepare, deployUpgradeable, performUpgrade } = require('./fixture');

describe('Forta', function () {
  prepare();

  describe('Token update', function () {
    it('authorized', async function () {
      this.token = await performUpgrade(this.token, 'Forta2');
      expect(await this.token.version()).to.be.equal('Forta2');
    });

    it('unauthorized', async function () {
      const ADMIN_ROLE = await this.token.ADMIN_ROLE();

      await this.token.renounceRole(ADMIN_ROLE, this.accounts.admin.address);
      await expect(performUpgrade(this.token, 'Forta2'))
        .to.be.revertedWith(`AccessControl: account ${this.accounts.admin.address.toLowerCase()} is missing role ${ADMIN_ROLE}`);
    });
  });

  describe('Vesting update', function () {
    describe('vesting with admin', function () {
      beforeEach(async function () {
        this.vesting = await deployUpgradeable('VestingWallet', 'uups', ethers.constants.AddressZero, this.accounts.admin.address, 0, 0);
        expect(await this.vesting.owner()).to.be.equal(this.accounts.admin.address);
      });

      it('authorized', async function () {
        this.vesting = await performUpgrade(this.vesting, 'VestingWallet2');
        expect(await this.vesting.version()).to.be.equal('VestingWallet2');
      });

      it('unauthorized', async function () {
        await this.vesting.transferOwnership(this.accounts.other.address);
        await expect(performUpgrade(this.vesting, 'VestingWallet2'))
          .to.be.revertedWith(`Ownable: caller is not the owner`);
      });
    });

    describe('locked vesting', function () {
      beforeEach(async function () {
        this.vesting = await deployUpgradeable('VestingWallet2', 'uups', ethers.constants.AddressZero, ethers.constants.AddressZero, 0, 0);
        expect(await this.vesting.owner()).to.be.equal(ethers.constants.AddressZero);
      });

      it('unauthorized', async function () {
        await expect(performUpgrade(this.vesting, 'VestingWallet2'))
          .to.be.revertedWith(`Ownable: caller is not the owner`);
      });
    });
  });

});
