const { ethers, upgrades } = require('hardhat');

const migrate = require('../scripts/deploy-platform');

function getFactory(name) {
  return ethers.getContractFactory(name);
}

function attach(factory, address) {
  return (typeof factory === 'string' ? getFactory(factory) : Promise.resolve(factory))
  .then(contract => contract.attach(address));
}

function deploy(factory, params = []) {
  return (typeof factory === 'string' ? getFactory(factory) : Promise.resolve(factory))
  .then(contract => contract.deploy(...params))
  .then(f => f.deployed());
}

function deployUpgradeable(factory, kind, params = [], opts = {}) {
  return (typeof factory === 'string' ? getFactory(factory) : Promise.resolve(factory))
  .then(contract => upgrades.deployProxy(contract, params, { kind, ...opts }))
  .then(f => f.deployed());
}

function performUpgrade(proxy, factory, opts = {}) {
  return (typeof factory === 'string' ? getFactory(factory) : Promise.resolve(factory))
  .then(contract => upgrades.upgradeProxy(proxy.address, contract, opts));
}

function prepare() {
  before(async function() {
    // list signers
    this.accounts = await ethers.getSigners();
    this.accounts.getAccount = (name) => (this.accounts[name]) || (this.accounts[name] = this.accounts.shift());
    [
      'admin',
      'manager',
      'minter',
      'whitelister',
      'whitelist',
      'nonwhitelist',
      'treasure',
      'user1',
      'user2',
      'user3',
      'other',
    ].map(name => this.accounts.getAccount(name));

    // migrate
    await migrate({ force: true, deployer: this.accounts.admin }).then(env => Object.assign(this, env));

    // mock contracts
    this.contracts.sink       = await deploy('Sink');
    this.contracts.otherToken = await deployUpgradeable('Forta', 'uups', [ this.deployer.address ]);

    // Set admin as default signer for all contracts
    Object.assign(this, this.contracts);

    // setup roles
    await Promise.all([
      this.staking   .connect(this.accounts.admin).setTreasury(this.accounts.treasure.address),
      this.access    .connect(this.accounts.admin).grantRole(this.roles.ENS_MANAGER,   this.accounts.admin.address      ),
      this.access    .connect(this.accounts.admin).grantRole(this.roles.UPGRADER,      this.accounts.admin.address      ),
      this.access    .connect(this.accounts.admin).grantRole(this.roles.AGENT_ADMIN,   this.accounts.manager.address    ),
      this.access    .connect(this.accounts.admin).grantRole(this.roles.SCANNER_ADMIN, this.accounts.manager.address    ),
      this.access    .connect(this.accounts.admin).grantRole(this.roles.DISPATCHER,    this.accounts.manager.address    ),
      this.token     .connect(this.accounts.admin).grantRole(this.roles.MINTER,        this.accounts.minter.address     ),
      this.token     .connect(this.accounts.admin).grantRole(this.roles.WHITELISTER,   this.accounts.whitelister.address),
      this.otherToken.connect(this.accounts.admin).grantRole(this.roles.MINTER,        this.accounts.minter.address     ),
      this.otherToken.connect(this.accounts.admin).grantRole(this.roles.WHITELISTER,   this.accounts.whitelister.address),
    ].map(txPromise => txPromise.then(tx => tx.wait())));

    await Promise.all([
      this.token     .connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.whitelist.address  ),
      this.token     .connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.treasure.address   ),
      this.token     .connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.staking.address             ),
      this.otherToken.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.whitelist.address  ),
      this.otherToken.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.treasure.address   ),
      this.otherToken.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.staking.address             ),
    ].map(txPromise => txPromise.then(tx => tx.wait())));

    __SNAPSHOT_ID__ = await ethers.provider.send('evm_snapshot');
  });

  beforeEach(async function() {
    await ethers.provider.send('evm_revert', [ __SNAPSHOT_ID__ ])
    __SNAPSHOT_ID__ = await ethers.provider.send('evm_snapshot');
  });
}

module.exports = {
  prepare,
  getFactory,
  attach,
  deploy,
  deployUpgradeable,
  performUpgrade,
}
