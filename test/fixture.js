const { ethers, upgrades } = require('hardhat');

upgrades.silenceWarnings();

function attach(name, ...params) {
  return ethers.getContractFactory(name)
    .then(contract => contract.attach(...params));
}

function deploy(name, ...params) {
  return ethers.getContractFactory(name)
    .then(contract => contract.deploy(...params))
    .then(f => f.deployed());
}

function deployUpgradeable(name, kind, ...params) {
  return ethers.getContractFactory(name)
    .then(contract => upgrades.deployProxy(contract, params, { kind, unsafeAllow: 'delegatecall' }))
    .then(f => f.deployed());
}

function performUpgrade(proxy, name) {
  return ethers.getContractFactory(name)
    .then(contract => upgrades.upgradeProxy(proxy.address, contract, { unsafeAllow: 'delegatecall' }));
}

function prepare() {
  beforeEach(async function () {
    this.accounts              = await ethers.getSigners();
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

    this.components = {}

    // This #1
    Object.assign(this, await Promise.all(Object.entries({
      token:      deployUpgradeable('Forta',         'uups', this.accounts.admin.address),
      otherToken: deployUpgradeable('Forta',         'uups', this.accounts.admin.address),
      access:     deployUpgradeable('AccessManager', 'uups', this.accounts.admin.address),
      sink:       deploy('Sink'),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries));

    // This #2
    Object.assign(this, await Promise.all(Object.entries({
      router:     deployUpgradeable('Router',        'uups', this.access.address),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries));

    // Components #1
    Object.assign(this.components, await Promise.all(Object.entries({
      staking:  deployUpgradeable('FortaStaking',    'uups', this.access.address, this.router.address, this.token.address, 0, this.accounts.treasure.address),
      agents:   deployUpgradeable('AgentRegistry',   'uups', this.access.address, this.router.address, 'Forta Agents', 'FAgents'),
      scanners: deployUpgradeable('ScannerRegistry', 'uups', this.access.address, this.router.address, 'Forta Scanners', 'FScanners'),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries));

    // Components #2
    Object.assign(this.components, await Promise.all(Object.entries({
      dispatch: deployUpgradeable('Dispatch',        'uups', this.access.address, this.router.address, this.components.agents.address, this.components.scanners.address),
      alerts:   deployUpgradeable('Alerts',          'uups', this.access.address, this.router.address, this.components.scanners.address),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries));

    // Roles dictionnary
    this.roles = await Promise.all(Object.entries({
      // Forta
      ADMIN:         this.token.ADMIN_ROLE(),
      MINTER:        this.token.MINTER_ROLE(),
      WHITELISTER:   this.token.WHITELISTER_ROLE(),
      WHITELIST:     this.token.WHITELIST_ROLE(),
      // AccessManager / AccessManaged roles
      DEFAULT_ADMIN: ethers.constants.HashZero,
      ROUTER_ADMIN:  ethers.utils.id('ROUTER_ADMIN_ROLE'),
      ENS_MANAGER:   ethers.utils.id('ENS_MANAGER_ROLE'),
      UPGRADER:      ethers.utils.id('UPGRADER_ROLE'),
      AGENT_ADMIN:   ethers.utils.id('AGENT_ADMIN_ROLE'),
      SCANNER_ADMIN: ethers.utils.id('SCANNER_ADMIN_ROLE'),
      DISPATCHER:    ethers.utils.id('DISPATCHER_ROLE'),
      SLASHER:       ethers.utils.id('SLASHER_ROLE'),
      SWEEPER:       ethers.utils.id('SWEEPER_ROLE'),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries);

    // Setup roles
    await Promise.all(
      [].concat(
        // Forta roles are standalone
        [ this.token, this.otherToken ].flatMap(token => [
          token.connect(this.accounts.admin      ).grantRole(this.roles.MINTER,        this.accounts.minter.address     ),
          token.connect(this.accounts.admin      ).grantRole(this.roles.WHITELISTER,   this.accounts.whitelister.address),
          token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST,     this.accounts.whitelist.address  ),
          token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST,     this.accounts.treasure.address   ),
          token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST,     this.components.staking.address  ),
        ]),
        // AccessManager roles
        [
          this.access.connect(this.accounts.admin).grantRole(this.roles.ENS_MANAGER,   this.accounts.admin.address      ),
          this.access.connect(this.accounts.admin).grantRole(this.roles.UPGRADER,      this.accounts.admin.address      ),
          this.access.connect(this.accounts.admin).grantRole(this.roles.AGENT_ADMIN,   this.accounts.manager.address    ),
          this.access.connect(this.accounts.admin).grantRole(this.roles.SCANNER_ADMIN, this.accounts.manager.address    ),
          this.access.connect(this.accounts.admin).grantRole(this.roles.DISPATCHER,    this.accounts.manager.address    ),
        ],
      ).map(txPromise => txPromise.then(tx => tx.wait()))
    );
  });
}

module.exports = {
  prepare,
  attach,
  deploy,
  deployUpgradeable,
  performUpgrade,
}
