const { ethers, upgrades } = require('hardhat');

upgrades.silenceWarnings();

function attach(name, address) {
  return ethers.getContractFactory(name)
    .then(contract => contract.attach(address));
}

function deploy(name, params = []) {
  return ethers.getContractFactory(name)
    .then(contract => contract.deploy(...params))
    .then(f => f.deployed());
}

function deployUpgradeable(name, kind, params = [], opts = {}) {
  return ethers.getContractFactory(name)
    .then(contract => upgrades.deployProxy(contract, params, { kind, ...opts }))
    .then(f => f.deployed());
}

function performUpgrade(proxy, name, opts = {}) {
  return ethers.getContractFactory(name)
    .then(contract => upgrades.upgradeProxy(proxy.address, contract, opts));
}

async function migrate() {
  // Allocate accounts
  const accounts = await ethers.getSigners();
  accounts.getAccount = (name) => (accounts[name]) || (accounts[name] = accounts.shift());
  [ 'admin', 'manager', 'minter', 'whitelister', 'whitelist', 'nonwhitelist', 'treasure', 'user1', 'user2', 'user3', 'other' ].map(name => accounts.getAccount(name));

  // Deploy contracts
  const contracts = { components: {} };

  // Deploy contracts #0
  Object.assign(contracts, await Promise.all(Object.entries({
    forwarder:  deploy('Forwarder'),
  }).map(entry => Promise.all(entry))).then(Object.fromEntries));

  // Deploy contracts #1
  Object.assign(contracts, await Promise.all(Object.entries({
    token: deployUpgradeable(
      'Forta',
      'uups',
      [ accounts.admin.address ],
    ),
    otherToken: deployUpgradeable(
      'Forta',
      'uups',
      [ accounts.admin.address ],
    ),
    access: deployUpgradeable(
      'AccessManager',
      'uups',
      [ accounts.admin.address ],
      { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' }
    ),
    sink: deploy('Sink'),
  }).map(entry => Promise.all(entry))).then(Object.fromEntries));

  // Deploy contracts #2
  Object.assign(contracts, await Promise.all(Object.entries({
    router: deployUpgradeable(
      'Router',
      'uups',
      [ contracts.access.address ],
      { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
    ),
  }).map(entry => Promise.all(entry))).then(Object.fromEntries));

  // Deploy contracts #3.1 - components
  Object.assign(contracts.components, await Promise.all(Object.entries({
    staking: deployUpgradeable(
      'FortaStaking',
      'uups',
      [ contracts.access.address, contracts.router.address, contracts.token.address, 0, accounts.treasure.address ],
      { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
    ),
    agents: deployUpgradeable(
      'AgentRegistry',
      'uups',
      [ contracts.access.address, contracts.router.address, 'Forta Agents', 'FAgents' ],
      { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
    ),
    scanners: deployUpgradeable(
      'ScannerRegistry',
      'uups',
      [ contracts.access.address, contracts.router.address, 'Forta Scanners', 'FScanners' ],
      { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
    ),
  }).map(entry => Promise.all(entry))).then(Object.fromEntries));

  // Deploy contracts #3.2 - components
  Object.assign(contracts.components, await Promise.all(Object.entries({
    dispatch: deployUpgradeable(
      'Dispatch',
      'uups',
      [ contracts.access.address, contracts.router.address, contracts.components.agents.address, contracts.components.scanners.address],
      { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
    ),
    alerts: deployUpgradeable(
      'Alerts',
      'uups',
      [ contracts.access.address, contracts.router.address, contracts.components.scanners.address],
      { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
    ),
  }).map(entry => Promise.all(entry))).then(Object.fromEntries));

  // Roles dictionnary
  const roles = await Promise.all(Object.entries({
    // Forta
    ADMIN:         contracts.token.ADMIN_ROLE(),
    MINTER:        contracts.token.MINTER_ROLE(),
    WHITELISTER:   contracts.token.WHITELISTER_ROLE(),
    WHITELIST:     contracts.token.WHITELIST_ROLE(),
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
  await Promise.all([
    // Forta roles are standalone
    contracts.token     .connect(accounts.admin      ).grantRole(roles.MINTER,        accounts.minter.address             ),
    contracts.token     .connect(accounts.admin      ).grantRole(roles.WHITELISTER,   accounts.whitelister.address        ),
    contracts.token     .connect(accounts.whitelister).grantRole(roles.WHITELIST,     accounts.whitelist.address          ),
    contracts.token     .connect(accounts.whitelister).grantRole(roles.WHITELIST,     accounts.treasure.address           ),
    contracts.token     .connect(accounts.whitelister).grantRole(roles.WHITELIST,     contracts.components.staking.address),
    contracts.otherToken.connect(accounts.admin      ).grantRole(roles.MINTER,        accounts.minter.address             ),
    contracts.otherToken.connect(accounts.admin      ).grantRole(roles.WHITELISTER,   accounts.whitelister.address        ),
    contracts.otherToken.connect(accounts.whitelister).grantRole(roles.WHITELIST,     accounts.whitelist.address          ),
    contracts.otherToken.connect(accounts.whitelister).grantRole(roles.WHITELIST,     accounts.treasure.address           ),
    contracts.otherToken.connect(accounts.whitelister).grantRole(roles.WHITELIST,     contracts.components.staking.address),
    contracts.access    .connect(accounts.admin      ).grantRole(roles.ENS_MANAGER,   accounts.admin.address              ),
    contracts.access    .connect(accounts.admin      ).grantRole(roles.UPGRADER,      accounts.admin.address              ),
    contracts.access    .connect(accounts.admin      ).grantRole(roles.AGENT_ADMIN,   accounts.manager.address            ),
    contracts.access    .connect(accounts.admin      ).grantRole(roles.SCANNER_ADMIN, accounts.manager.address            ),
    contracts.access    .connect(accounts.admin      ).grantRole(roles.DISPATCHER,    accounts.manager.address            ),
  ].map(txPromise => txPromise.then(tx => tx.wait())));

  return {
    accounts,
    contracts,
    roles,
  }
}

function prepare() {
  before(async function() {
    await migrate().then(env => Object.assign(this, env, env.contracts));
    __SNAPSHOT_ID__ = await ethers.provider.send('evm_snapshot');
  });

  beforeEach(async function() {
    await ethers.provider.send('evm_revert', [ __SNAPSHOT_ID__ ])
    __SNAPSHOT_ID__ = await ethers.provider.send('evm_snapshot');
  });
}

module.exports = {
  prepare,
  attach,
  deploy,
  deployUpgradeable,
  performUpgrade,
}
