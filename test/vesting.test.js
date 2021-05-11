const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');

async function attach(name, ...params) {
  const Contract = await ethers.getContractFactory(name);
  return await Contract.attach(...params);
}

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
    this.token      = await deployUpgradeable('Fortify', 'uups', this.accounts.upgrader.address);
    this.accesslist = await deployUpgradeable('AccessList', 'transparent');
    this.factory    = await deploy('VestingFactory', this.accesslist.address);
    this.template   = await attach('VestingWallet', await this.factory.template());

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
    expect(await this.accesslist.owner()).to.be.equal(this.accounts.upgrader.address);
    expect(await this.template.accesslist()).to.be.equal(this.accesslist.address);
  });

  it('create vesting contract', async function () {
    const start         = Date.now() / 1000 | 0;
    const cliffDuration = 1 * 365 * 86400; // 1 year
    const duration      = 4 * 365 * 86400; // 4 year

    const { wait } = await this.factory.create(
      this.accounts.other.address,
      this.accounts.upgrader.address,
      start,
      cliffDuration,
      duration,
    );
    const { events } = await wait();
    const { instance } = events.find(({ event }) => event == "NewVesting").args;
    const vesting = await attach('VestingWallet', instance);

    expect(await vesting.beneficiary()).to.be.equal(this.accounts.other.address);
    expect(await vesting.owner()).to.be.equal(this.accounts.upgrader.address);
    expect(await vesting.start()).to.be.equal(start);
    expect(await vesting.duration()).to.be.equal(duration);
    expect(await vesting.cliff()).to.be.equal(start + cliffDuration);
  });
});
