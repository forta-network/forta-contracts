const { ethers, upgrades } = require('hardhat');

function attach(name, ...params) {
  return ethers.getContractFactory(name)
    .then(contract => Contract.attach(...params));
}

function deploy(name, ...params) {
  return ethers.getContractFactory(name)
    .then(contract => contract.deploy(...params))
    .then(f => f.deployed());
}

function deployUpgradeable(name, kind, ...params) {
  return ethers.getContractFactory(name)
    .then(contract => upgrades.deployProxy(contract, params, { kind }))
    .then(f => f.deployed());
}

function performUpgrade(proxy, name) {
  return ethers.getContractFactory(name)
    .then(contract => upgrades.upgradeProxy(proxy.address, contract, {}));
}

function prepare() {
  before(async function() {
    this.accounts = await ethers.getSigners();
    this.accounts.admin        = this.accounts.shift();
    this.accounts.minter       = this.accounts.shift();
    this.accounts.whitelister  = this.accounts.shift();
    this.accounts.whitelist    = this.accounts.shift();
    this.accounts.nonwhitelist = this.accounts.shift();
    this.accounts.user1        = this.accounts.shift();
    this.accounts.user2        = this.accounts.shift();
    this.accounts.user3        = this.accounts.shift();
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

    this.staking = await deployUpgradeable('FortaStaking', 'uups', this.token.address, 0, this.accounts.admin.address);
  });
}

module.exports = {
  prepare,
  attach,
  deploy,
  deployUpgradeable,
  performUpgrade,
}
