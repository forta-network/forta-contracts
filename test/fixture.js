const { ethers, upgrades } = require('hardhat');
const migrate = require('../scripts/deploy-platform');
const utils   = require('../scripts/utils');

function prepare(config = {}) {
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
    await migrate(Object.assign({
        force:                  true,
        deployer:               this.accounts.admin,
        childChainManagerProxy: config.childChain && this.accounts.admin.address
    })).then(env => Object.assign(this, env));

    // mock contracts
    this.contracts.sink       = await utils.deploy('Sink');
    this.contracts.otherToken = await utils.deployUpgradeable('Forta', 'uups', [ this.deployer.address ]);

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
    ].map(txPromise => txPromise.then(tx => tx.wait()).catch(() => {})));

    await Promise.all([
      this.token     .connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.whitelist.address  ),
      this.token     .connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.treasure.address   ),
      this.token     .connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.staking.address             ),
      this.otherToken.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.whitelist.address  ),
      this.otherToken.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.treasure.address   ),
      this.otherToken.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.staking.address             ),
    ].map(txPromise => txPromise.then(tx => tx.wait()).catch(() => {})));

    __SNAPSHOT_ID__ = await ethers.provider.send('evm_snapshot');
  });

  beforeEach(async function() {
    await ethers.provider.send('evm_revert', [ __SNAPSHOT_ID__ ])
    __SNAPSHOT_ID__ = await ethers.provider.send('evm_snapshot');
  });
}

module.exports = {
  prepare,
  getFactory:        utils.getFactory,
  attach:            utils.attach,
  deploy:            utils.deploy,
  deployUpgradeable: utils.deployUpgradeable,
  performUpgrade:    utils.performUpgrade,
}
