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

async function performUpgrade(proxy, name) {
  const Contract = await ethers.getContractFactory(name);
  return await upgrades.upgradeProxy(proxy.address, Contract, {});
}

function prepare() {
  before(async function() {
    this.accounts = await ethers.getSigners();
    this.accounts.admin        = this.accounts.shift();
    this.accounts.minter       = this.accounts.shift();
    this.accounts.whitelister  = this.accounts.shift();
    this.accounts.whitelist    = this.accounts.shift();
    this.accounts.nonwhitelist = this.accounts.shift();
    this.accounts.other        = this.accounts.shift();
  });

  beforeEach(async function () {
    this.token = await deployUpgradeable('Forta', 'uups', this.accounts.admin.address);
    this.roles = {
      ADMIN:       await this.token.ADMIN_ROLE(),
      MINTER:      await this.token.MINTER_ROLE(),
      WHITELISTER: await this.token.WHITELISTER_ROLE(),
      WHITELIST:   await this.token.WHITELIST_ROLE(),
    }
    await this.token.connect(this.accounts.admin).grantRole(this.roles.MINTER, this.accounts.minter.address);
    await this.token.connect(this.accounts.admin).grantRole(this.roles.WHITELISTER, this.accounts.whitelister.address);
    await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.whitelist.address);
  });
}

module.exports = {
  prepare,
  attach,
  deploy,
  deployUpgradeable,
  performUpgrade,
}
