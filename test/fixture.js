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
      this.access    .connect(this.accounts.admin).grantRole(this.roles.SCANNER_VERSION, this.accounts.admin.address    ),
      this.access    .connect(this.accounts.admin).grantRole(this.roles.REWARDS_ADMIN, this.accounts.admin.address      ),
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

    // Upgrades
    // Agents v0.1.2
    await this.agents.connect(this.accounts.admin).setStakeController(this.contracts.staking.address)
    // Scanners v0.1.1
    await this.scanners.connect(this.accounts.admin).setStakeController(this.contracts.staking.address)

    // Prep for tests that need minimum stake
    if (config.minStake) {
      await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.user1.address);
      await this.token.connect(this.accounts.minter).mint(this.accounts.user1.address, ethers.utils.parseEther('1000'));
      this.accounts.staker = this.accounts.user1
      await this.token.connect(this.accounts.staker).approve(this.staking.address, ethers.constants.MaxUint256);
      this.stakingSubjects = {};
      this.stakingSubjects.SCANNER_SUBJECT_TYPE = 0;
      this.stakingSubjects.AGENT_SUBJECT_TYPE = 1;
      await this.staking.connect(this.accounts.admin).setMinStake(this.stakingSubjects.SCANNER_SUBJECT_TYPE, config.minStake);
      await this.staking.connect(this.accounts.admin).setMinStake(this.stakingSubjects.AGENT_SUBJECT_TYPE, config.minStake);
    }

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
