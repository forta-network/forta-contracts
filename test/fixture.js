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
    this.accounts.manager      = this.accounts.shift();
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

    this.modules = await Promise.all(Object.entries({
      staking:  deployUpgradeable('FortaStaking',    'uups', this.access.address, this.token.address, 0, this.accounts.treasure.address),
      agents:   deployUpgradeable('AgentRegistry',   'uups', this.access.address, 'Forta Agents',   'FAgents'),
      scanners: deployUpgradeable('ScannerRegistry', 'uups', this.access.address, 'Forta Scanners', 'FScanners'),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries);

    this.roles = await Promise.all(Object.entries({
      ADMIN:           this.token.ADMIN_ROLE(),
      MINTER:          this.token.MINTER_ROLE(),
      WHITELISTER:     this.token.WHITELISTER_ROLE(),
      WHITELIST:       this.token.WHITELIST_ROLE(),
      SLASHER:         this.modules.staking.SLASHER_ROLE(),
      AGENT_MANAGER:   this.modules.agents.AGENT_MANAGER_ROLE(),
      SCANNER_MANAGER: this.modules.scanners.SCANNER_MANAGER_ROLE(),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries);

    await Promise.all([
      // Forta roles are standalone
      this.token.connect(this.accounts.admin).grantRole(this.roles.MINTER, this.accounts.minter.address),
      this.token.connect(this.accounts.admin).grantRole(this.roles.WHITELISTER, this.accounts.whitelister.address),
      this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.whitelist.address),
      this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.treasure.address),
      this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.modules.staking.address),
      // Access manager for the rest of the platform
      this.access.setNewRole(this.roles.SLASHER,         this.roles.ADMIN),
      this.access.setNewRole(this.roles.AGENT_MANAGER,   this.roles.ADMIN),
      this.access.setNewRole(this.roles.SCANNER_MANAGER, this.roles.ADMIN),
      this.access.connect(this.accounts.admin).grantRole(this.roles.AGENT_MANAGER,   this.accounts.manager.address),
      this.access.connect(this.accounts.admin).grantRole(this.roles.SCANNER_MANAGER, this.accounts.manager.address),
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
