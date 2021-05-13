const { ethers, upgrades } = require('hardhat');

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

function prepare() {
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
}

module.exports = {
  prepare,
  attach,
  deploy,
  deployUpgradeable,
}
