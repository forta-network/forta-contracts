const migrate = require('../scripts/deploy-platform');

function prepare() {
  before(async function() {
    // migrate
    await migrate().then(env => Object.assign(this, env));

    // mock contracts
    this.contracts.sink = await migrate.deploy(
      migrate.getFactory('Sink').then(factory => factory.connect(this.deployer)),
    );

    this.contracts.otherToken = await migrate.deployUpgradeable(
      migrate.getFactory('Forta').then(factory => factory.connect(this.deployer)),
      'uups',
      [ this.deployer.address ],
    );

    // list signers
    this.accounts = await ethers.getSigners();
    this.accounts.getAccount = (name) => (this.accounts[name]) || (this.accounts[name] = this.accounts.shift());
    [ 'deployer', 'admin', 'manager', 'minter', 'whitelister', 'whitelist', 'nonwhitelist', 'treasure', 'user1', 'user2', 'user3', 'other' ].map(name => this.accounts.getAccount(name));

    // Set admin as default signer for all contracts
    this.contracts = Object.fromEntries(Object.entries(this.contracts).map(([ name, contract ]) => ([ name, contract.connect(this.accounts.admin) ])));
    Object.assign(this, this.contracts);

    // setup roles
    await Promise.all([
      this.staking   .connect(this.deployer).setTreasury(this.accounts.treasure.address),
      this.access    .connect(this.deployer).grantRole(this.roles.DEFAULT_ADMIN, this.accounts.admin.address      ),
      this.access    .connect(this.deployer).grantRole(this.roles.ENS_MANAGER,   this.accounts.admin.address      ),
      this.access    .connect(this.deployer).grantRole(this.roles.UPGRADER,      this.accounts.admin.address      ),
      this.access    .connect(this.deployer).grantRole(this.roles.AGENT_ADMIN,   this.accounts.manager.address    ),
      this.access    .connect(this.deployer).grantRole(this.roles.SCANNER_ADMIN, this.accounts.manager.address    ),
      this.access    .connect(this.deployer).grantRole(this.roles.DISPATCHER,    this.accounts.manager.address    ),
      this.token     .connect(this.deployer).grantRole(this.roles.ADMIN,         this.accounts.admin.address      ),
      this.token     .connect(this.deployer).grantRole(this.roles.MINTER,        this.accounts.minter.address     ),
      this.token     .connect(this.deployer).grantRole(this.roles.WHITELISTER,   this.accounts.whitelister.address),
      this.otherToken.connect(this.deployer).grantRole(this.roles.ADMIN,         this.accounts.admin.address      ),
      this.otherToken.connect(this.deployer).grantRole(this.roles.MINTER,        this.accounts.minter.address     ),
      this.otherToken.connect(this.deployer).grantRole(this.roles.WHITELISTER,   this.accounts.whitelister.address),
    ].map(txPromise => txPromise.then(tx => tx.wait())));

    await Promise.all([
      this.token     .connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST,     this.accounts.whitelist.address  ),
      this.token     .connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST,     this.accounts.treasure.address   ),
      this.token     .connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST,     this.staking.address             ),
      this.otherToken.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST,     this.accounts.whitelist.address  ),
      this.otherToken.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST,     this.accounts.treasure.address   ),
      this.otherToken.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST,     this.staking.address             ),
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
  getFactory:        migrate.getFactory,
  attach:            migrate.attach,
  deploy:            migrate.deploy,
  deployUpgradeable: migrate.deployUpgradeable,
  performUpgrade:    migrate.performUpgrade,
}
