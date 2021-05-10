const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');

async function deploy(name, ...params) {
  const Contract = await ethers.getContractFactory(name);
  return await Contract.deploy(...params).then(f => f.deployed());
}

async function deployUpgradeable(name, kind, ...params) {
  const Contract = await ethers.getContractFactory(name);
  return await upgrades.deployProxy(Contract, params, { kind }).then(f => f.deployed());
}

describe('Fortify', function () {
  before(async function() {
    this.accounts = await ethers.getSigners();
    this.accounts.upgrader     = this.accounts.shift();
    this.accounts.minter       = this.accounts.shift();
    this.accounts.whitelister  = this.accounts.shift();
    this.accounts.whitelist    = this.accounts.shift();
    this.accounts.nonwhitelist = this.accounts.shift();
    this.accounts.other        = this.accounts.shift();
  });

  beforeEach(async function () {
    this.token = await deployUpgradeable('Fortify', 'uups', this.accounts.upgrader.address);
    this.roles = {
      UPGRADER:    await this.token.UPGRADER_ROLE(),
      MINTER:      await this.token.MINTER_ROLE(),
      WHITELISTER: await this.token.WHITELISTER_ROLE(),
      WHITELIST:   await this.token.WHITELIST_ROLE(),
    }
    await this.token.connect(this.accounts.upgrader).grantRole(this.roles.MINTER, this.accounts.minter.address);
    await this.token.connect(this.accounts.upgrader).grantRole(this.roles.WHITELISTER, this.accounts.whitelister.address);
    await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.whitelist.address);
  });

  it('check deployment', async function () {
    expect(await this.token.hasRole(this.roles.UPGRADER,    this.accounts.upgrader.address));
    expect(await this.token.hasRole(this.roles.MINTER,      this.accounts.minter.address));
    expect(await this.token.hasRole(this.roles.WHITELISTER, this.accounts.whitelister.address));
  });

  describe('spread whitelist', function () {
    it('not authorized', async function () {
      await expect(this.token.connect(this.accounts.whitelist).grantWhitelister(this.accounts.other.address))
        .to.be.revertedWith(`AccessControl: account ${this.accounts.whitelist.address.toLowerCase()} is missing role ${this.roles.WHITELISTER}`);
    });

    it('authorized', async function () {
      await expect(this.token.connect(this.accounts.whitelister).grantWhitelister(this.accounts.other.address))
        .to.emit(this.token, 'RoleGranted')
        .withArgs(this.roles.WHITELISTER, this.accounts.other.address, this.token.address);
    });
  });

  describe('mint', function () {
    describe('non-authorized', function () {
      it('to non-whitelisted', async function () {
        await expect(this.token.connect(this.accounts.whitelister).mint(this.accounts.nonwhitelist.address, 1))
          .to.be.revertedWith(`AccessControl: account ${this.accounts.whitelister.address.toLowerCase()} is missing role ${this.roles.MINTER}`);
      });

      it('to whitelisted', async function () {
        await expect(this.token.connect(this.accounts.whitelister).mint(this.accounts.whitelist.address, 1))
          .to.be.revertedWith(`AccessControl: account ${this.accounts.whitelister.address.toLowerCase()} is missing role ${this.roles.MINTER}`);
      });
    });

    describe('non-authorized', function () {
      it('to non-whitelisted', async function () {
        await expect(this.token.connect(this.accounts.minter).mint(this.accounts.nonwhitelist.address, 1))
          .to.be.revertedWith(`Fortify: receiver is not whitelisted`);
      });

      it('to whitelisted', async function () {
        await expect(this.token.connect(this.accounts.minter).mint(this.accounts.whitelist.address, 1))
          .to.emit(this.token, 'Transfer')
          .withArgs(ethers.constants.AddressZero, this.accounts.whitelist.address, 1);
      });
    });
  });

});
