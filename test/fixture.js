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

    this.router = await deployUpgradeable('Router', 'uups',
      this.access.address
    );

    this.components = await Promise.all(Object.entries({
      staking:  deployUpgradeable('FortaStaking', 'uups',
        this.access.address,
        this.router.address,
        this.token.address,
        0,
        this.accounts.treasure.address,
      ),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries);

    this.sink = await deploy('Sink');

    this.roles = await Promise.all(Object.entries({
      ADMIN:        this.token.ADMIN_ROLE(),
      MINTER:       this.token.MINTER_ROLE(),
      WHITELISTER:  this.token.WHITELISTER_ROLE(),
      WHITELIST:    this.token.WHITELIST_ROLE(),
      ROUTER_ADMIN: this.router.ROUTER_ADMIN(),
      SLASHER:      this.components.staking.SLASHER_ROLE(),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries);

    await Promise.all([
      // Forta roles are standalone
      this.token.connect(this.accounts.admin).grantRole(this.roles.MINTER, this.accounts.minter.address),
      this.token.connect(this.accounts.admin).grantRole(this.roles.WHITELISTER, this.accounts.whitelister.address),
      this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.whitelist.address),
      this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.treasure.address),
      this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.components.staking.address),
      // Access manager for the rest of the platform
      this.access.setNewRole(this.roles.SLASHER,      this.roles.ADMIN),
      this.access.setNewRole(this.roles.ROUTER_ADMIN, this.roles.ADMIN),
    ]);
  });
}

module.exports = {
  prepare,
  attach,
  deploy,
  deployUpgradeable,
  performUpgrade,
}
