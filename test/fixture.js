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
    this.accounts.treasure     = this.accounts.shift();
    this.accounts.user1        = this.accounts.shift();
    this.accounts.user2        = this.accounts.shift();
    this.accounts.user3        = this.accounts.shift();
    this.accounts.other        = this.accounts.shift();
  });

  beforeEach(async function () {
    this.token = await deployUpgradeable('Forta', 'uups',
      this.accounts.admin.address
    );

    this.access = await deployUpgradeable('AccessManager', 'uups',
      this.accounts.admin.address
    );

    this.staking = await deployUpgradeable('FortaStaking', 'uups',
      this.access.address,
      this.token.address,
      0,
      this.accounts.treasure.address,
    );

    this.roles = await Promise.all([
      this.token.ADMIN_ROLE().then(ADMIN => ({ ADMIN })),
      this.token.MINTER_ROLE().then(MINTER => ({ MINTER })),
      this.token.WHITELISTER_ROLE().then(WHITELISTER => ({ WHITELISTER })),
      this.token.WHITELIST_ROLE().then(WHITELIST => ({ WHITELIST })),
      this.staking.SLASHER_ROLE().then(SLASHER => ({ SLASHER })),
    ]).then(entries => Object.assign(...entries));

    // Forta roles are standalone
    await this.token.connect(this.accounts.admin).grantRole(this.roles.MINTER, this.accounts.minter.address);
    await this.token.connect(this.accounts.admin).grantRole(this.roles.WHITELISTER, this.accounts.whitelister.address);
    await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.whitelist.address);
    await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.staking.address);
    await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.treasure.address);

    // Access manager for the rest of the platform
    await this.access.setNewRole(this.roles.SLASHER, this.roles.ADMIN);
  });
}

module.exports = {
  prepare,
  attach,
  deploy,
  deployUpgradeable,
  performUpgrade,
}
