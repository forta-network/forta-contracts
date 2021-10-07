const { ethers } = require('hardhat');
const { expect } = require('chai');
const { prepare, getFactory, attach, deployUpgradeable, performUpgrade } = require('./fixture');

describe('Forta upgrade', function () {
  prepare();

  describe('Token update', function () {
    it('authorized', async function () {
      this.token = await performUpgrade(
        this.token,
        getFactory('Forta2').then(factory => factory.connect(this.accounts.admin)),
      );
      expect(await this.token.version()).to.be.equal('Forta2');
    });

    it('unauthorized', async function () {
      const ADMIN_ROLE = await this.token.ADMIN_ROLE();

      await this.token.renounceRole(ADMIN_ROLE, this.accounts.admin.address);
      await expect(performUpgrade(
        this.token,
        getFactory('Forta2').then(factory => factory.connect(this.accounts.admin)),
      )).to.be.revertedWith(`AccessControl: account ${this.accounts.admin.address.toLowerCase()} is missing role ${ADMIN_ROLE}`);
    });
  });

  describe('Vesting update', function () {
    describe('vesting with admin', function () {
      beforeEach(async function () {
        this.vesting = await deployUpgradeable(
          getFactory('VestingWallet').then(factory => factory.connect(this.accounts.admin)),
          'uups',
          [
            this.accounts.other.address,
            this.accounts.admin.address,
            0,
            0,
            0,
          ],
          { unsafeAllow: 'delegatecall' },
        );
        expect(await this.vesting.owner()).to.be.equal(this.accounts.admin.address);
      });

      it('authorized', async function () {
        this.vesting = await performUpgrade(
          this.vesting,
          getFactory('VestingWallet2').then(factory => factory.connect(this.accounts.admin)),
          { unsafeAllow: 'delegatecall' },
        );
        expect(await this.vesting.version()).to.be.equal('VestingWallet2');
      });

      it('unauthorized', async function () {
        await this.vesting.transferOwnership(this.accounts.other.address);
        await expect(performUpgrade(
          this.vesting,
          getFactory('VestingWallet2').then(factory => factory.connect(this.accounts.admin)),
          { unsafeAllow: 'delegatecall' },
        )).to.be.revertedWith(`Ownable: caller is not the owner`);
      });
    });

    describe('locked vesting', function () {
      beforeEach(async function () {
        this.vesting = await deployUpgradeable(
          getFactory('VestingWallet2').then(factory => factory.connect(this.accounts.admin)),
          'uups',
          [
            this.accounts.other.address,
            ethers.constants.AddressZero,
            0,
            0,
            0,
          ],
          { unsafeAllow: 'delegatecall' },
        );
        expect(await this.vesting.owner()).to.be.equal(ethers.constants.AddressZero);
      });

      it('unauthorized', async function () {
        await expect(performUpgrade(
          this.vesting,
          getFactory('VestingWallet2').then(factory => factory.connect(this.accounts.admin)),
          { unsafeAllow: 'delegatecall' },
        )).to.be.revertedWith(`Ownable: caller is not the owner`);
      });
    });
  });
});
