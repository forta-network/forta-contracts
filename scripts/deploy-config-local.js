const { ethers } = require('hardhat');
const migrate = require('../scripts/deploy-platform');
const deployBatchRelayer = require('../scripts/deploy-batch-relayer');
const utils = require('../scripts/utils');
const DEBUG = require('debug')('forta:deploy-config-local');

async function deployAndConfig(config = {}) {
    // list signers
    this.accounts = await ethers.getSigners();
    this.accounts.getAccount = (name) => this.accounts[name] || (this.accounts[name] = this.accounts.shift());
    ['admin', 'manager', 'minter', 'treasure', 'user1', 'user2', 'user3', 'other'].map((name) => this.accounts.getAccount(name));
    const provider = await utils.getDefaultProvider();
    this.accounts.admin = await utils.getDefaultDeployer(provider);
    DEBUG('Fixture: deploying components');

    // migrate
    const { contracts, roles } = await migrate(
        Object.assign({
            force: true,
            deployer: this.accounts.admin,
            childChainManagerProxy: config.adminAsChildChainManagerProxy && this.accounts.admin.address,
            childChain: config.childChain ?? true,
        })
    );

    this.contracts = contracts;
    this.roles = roles;
    this.deployer = this.accounts.admin;

    DEBUG('Fixture: migrated');
    DEBUG('Fixture: deploying BatchRelayer');

    this.contracts.relayer = await deployBatchRelayer({ provider: provider, deployer: this.accounts.admin });

    DEBUG('BatchRelayer: migrated');
    DEBUG('Fixture: roleSetting');

    // Set admin as default signer for all contracts
    Object.assign(this, this.contracts);

    // setup roles
    const roleSetting = [
        this.access.connect(this.accounts.admin).grantRole(this.roles.ENS_MANAGER, this.accounts.admin.address),
        this.access.connect(this.accounts.admin).grantRole(this.roles.UPGRADER, this.accounts.admin.address),
        this.access.connect(this.accounts.admin).grantRole(this.roles.AGENT_ADMIN, this.accounts.manager.address),
        this.access.connect(this.accounts.admin).grantRole(this.roles.SCANNER_ADMIN, this.accounts.manager.address),
        this.access.connect(this.accounts.admin).grantRole(this.roles.SCANNER_ADMIN, this.accounts.admin.address),
        this.access.connect(this.accounts.admin).grantRole(this.roles.NODE_RUNNER_ADMIN, this.accounts.manager.address),
        this.access.connect(this.accounts.admin).grantRole(this.roles.NODE_RUNNER_ADMIN, this.accounts.admin.address),
        this.access.connect(this.accounts.admin).grantRole(this.roles.DISPATCHER, this.accounts.manager.address),
        this.access.connect(this.accounts.admin).grantRole(this.roles.SCANNER_VERSION, this.accounts.admin.address),
        this.access.connect(this.accounts.admin).grantRole(this.roles.REWARDER, this.accounts.admin.address),
        this.token.connect(this.accounts.admin).grantRole(this.roles.MINTER, this.accounts.minter.address),
        this.staking.connect(this.accounts.admin).setTreasury(this.accounts.treasure.address),
    ];

    for (const prom of roleSetting) {
        const tx = await prom;
        await tx.wait();
    }

    DEBUG('Fixture: setup roles');

    // Prep for tests that need minimum stake
    if (config.stake) {
        DEBUG('Fixture: config staking');

        if (!config.adminAsChildChainManagerProxy) {
            //Bridged FORT does not have mint()
            await this.token.connect(this.accounts.minter).mint(this.accounts.user1.address, ethers.utils.parseEther('100000000000'));
            await this.token.connect(this.accounts.minter).mint(this.accounts.admin.address, ethers.utils.parseEther('100000000000'));
        }
        this.accounts.staker = this.accounts.user1;
        await this.token.connect(this.accounts.staker).approve(this.staking.address, ethers.constants.MaxUint256);
        this.stakingSubjects = {};
        this.stakingSubjects.SCANNER = 0;
        this.stakingSubjects.AGENT = 1;
        await this.agents.connect(this.accounts.manager).setStakeThreshold({ max: config.stake.max, min: config.stake.min, activated: config.stake.activated });
        await this.scanners.connect(this.accounts.manager).setStakeThreshold({ max: config.stake.max, min: config.stake.min, activated: config.stake.activated }, 1);

        DEBUG('Fixture: stake configured');
    }

    return {
        contracts: this.contracts,
        accounts: this.accounts,
        roles: this.roles,
        stakingSubjects: this.stakingSubjects,
        provider: this.provider,
        deployer: this.accounts.admin,
    };
}

module.exports = {
    deployAndConfig,
    getFactory: utils.getFactory,
    attach: utils.attach,
    deploy: utils.deploy,
    deployUpgradeable: utils.deployUpgradeable,
    performUpgrade: utils.performUpgrade,
};
