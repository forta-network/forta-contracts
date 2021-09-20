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

    this.otherToken = await deployUpgradeable('Forta', 'uups',
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
      // Forta
      ADMIN:         this.token.ADMIN_ROLE(),
      MINTER:        this.token.MINTER_ROLE(),
      WHITELISTER:   this.token.WHITELISTER_ROLE(),
      WHITELIST:     this.token.WHITELIST_ROLE(),
      // AccessManager / AccessManaged roles
      DEFAULT_ADMIN: ethers.constants.HashZero,
      ENS_MANAGER:   ethers.utils.id('ENS_MANAGER_ROLE'),
      ROUTER_ADMIN:  ethers.utils.id('ROUTER_ADMIN_ROLE'),
      UPGRADER:      ethers.utils.id('UPGRADER_ROLE'),
      SLASHER:       ethers.utils.id('SLASHER_ROLE'),
      SWEEPER:       ethers.utils.id('SWEEPER_ROLE'),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries);

    await Promise.all([].concat(
      // Forta roles are standalone
      [ this.token, this.otherToken ].flatMap(token => [
        token.connect(this.accounts.admin).grantRole(this.roles.MINTER, this.accounts.minter.address),
        token.connect(this.accounts.admin).grantRole(this.roles.WHITELISTER, this.accounts.whitelister.address),
        token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.whitelist.address),
        token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.treasure.address),
        token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.components.staking.address),
      ]),
      // AccessManager roles
      [
        this.access.connect(this.accounts.admin).grantRole(this.roles.ENS_MANAGER, this.accounts.admin.address),
        this.access.connect(this.accounts.admin).grantRole(this.roles.UPGRADER,    this.accounts.admin.address),
      ],
    ));
  });
}

module.exports = {
  prepare,
  attach,
  deploy,
  deployUpgradeable,
  performUpgrade,
}
