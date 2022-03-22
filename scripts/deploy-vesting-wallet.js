const { ethers, upgrades, network } = require('hardhat');
const DEBUG                = require('debug')('forta:migration');
const utils                = require('./utils');
const assert = require('assert');
const SCANNER_SUBJECT = 0;
const AGENT_SUBJECT = 1;
const semver = require('semver')

upgrades.silenceWarnings();

const ROOT_CHAIN_MANAGER = {
    1:     '0x0D29aDA4c818A9f089107201eaCc6300e56E0d5c',
    5:     '0xBbD7cBFA79faee899Eaf900F13C9065bF03B1A74',
};

const allocation = {
    beneficiary: null,
    upgrader: null,
    start: '2022-03-21T00:00:00Z',
    cliff: '30 minutes',
    duration: '30 days',
}


async function main() {
    const provider = config?.provider ?? config?.deployer?.provider ?? await utils.getDefaultProvider();
    const deployer = config?.deployer ??                               await utils.getDefaultDeployer(provider);
    const { name, chainId } = await provider.getNetwork();
    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`ENS:      ${provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`Balance:  ${await provider.getBalance(deployer.address).then(ethers.utils.formatEther)}${ethers.constants.EtherSymbol}`);
    DEBUG('----------------------------------------------------');
    utils.assertNotUsingHardhatKeys(chainId, deployer);
    
    const CACHE_L1 = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });
    let CACHE_L2
    const beneficiary = allocation.beneficiary ?? deployer.address;
    const upgrader       = allocation.upgrader ?? deployer.address;
    const start       = utils.dateToTimestamp(allocation.start);
    const cliff       = utils.durationToSeconds(allocation.cliff);
    const duration    = utils.durationToSeconds(allocation.duration);
    const l1Token = await CACHE_L1.get('forta.address');
    
    let rootChainManager
    switch (chainId) {
        case 1:
            rootChainManager = ROOT_CHAIN_MANAGER[1];
            CACHE_L2 = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${137}` });
            break;
        case 5:
            rootChainManager = ROOT_CHAIN_MANAGER[5];
            CACHE_L2 = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${80001}` });
            break;
        default:
            throw new Error(`Unsupported chain ${chainId}`);

    }
    const l2EscrowFactory = await CACHE_L2.get('escrow-factory.address');
    const l2EscrowTemplate = await CACHE_L2.get('escrow-template.address');
    console.log(l2EscrowFactory, l2EscrowTemplate)
    
    console.log('Deploying:')
    //console.log(Object.entries(allocation))
    Object.entries(allocation).forEach(x => console.log(x));
         
    
    /*const vesting = await ethers.getContractFactory('VestingWalletV2', deployer).then(factory => utils.tryFetchProxy(
        CACHE_L1,
        `vesting-${beneficiary}`,
        factory,
        'uups',
        [ beneficiary, upgrader, start, cliff, duration ],
        {
            constructorArgs: [
                rootChainManager,
                l1Token,
                l2EscrowFactory,
                l2EscrowTemplate,
            ],
            unsafeAllow: 'delegatecall' },
    ));*/
    const vesting = await utils.performUpgrade(
        await utils.attach('VestingWalletV2', await CACHE_L1.get(`vesting-${deployer.address}.address`)),
        await ethers.getContractFactory('VestingWalletV2', deployer),
        {
            constructorArgs: [
                rootChainManager,
                l1Token,
                l2EscrowFactory,
                l2EscrowTemplate,
            ],
            unsafeAllow: 'delegatecall'
        },
        CACHE_L1,
        `vesting-${deployer.address}`
    );

    console.log('Deployed vesting wallet:', vesting.address);
    console.log('Post deployment checks...');

    await Promise.all([
        vesting.start(),
        vesting.cliff(),
        vesting.duration(),
        vesting.beneficiary(),
        vesting.owner(),
        vesting.rootChainManager(),
        vesting.l1Token(),
        vesting.l2EscrowFactory(),
        vesting.l2EscrowTemplate(),
        vesting.historicalBalanceMin()
      ]).then(([ start, cliff, duration, beneficiary, owner, rootChainManager, l1Token, l2EscrowFactory, l2EscrowTemplate, historicalBalanceMin]) => {
        assert(start.eq(utils.dateToTimestamp(allocation.start)),         `Wrong start for vested allocation to ${beneficiary}`);
        assert(cliff.eq(utils.durationToSeconds(allocation.cliff)),       `Wrong cliff for vested allocation to ${beneficiary}`);
        assert(duration.eq(utils.durationToSeconds(allocation.duration)), `Wrong duration for vested allocation to ${beneficiary}`);
        assert.strictEqual(beneficiary.toLowerCase(), beneficiary.toLowerCase(), `Wrong beneficiary for vested allocation to ${beneficiary}`);
        assert.strictEqual(owner.toLowerCase(), upgrader.toLowerCase(),    `Wrong admin for direct allocation to ${beneficiary}`);
        assert.strictEqual(rootChainManager.toLowerCase(), rootChainManager.toLowerCase(),  `Wrong rootChainManager for ${beneficiary}`);
        assert.strictEqual(l1Token.toLowerCase(), l1Token.toLowerCase(),    `Wrong l1Token for direct allocation to ${l1Token}`);
        assert.strictEqual(l2EscrowFactory.toLowerCase(), l2EscrowFactory.toLowerCase(),    `Wrong l2EscrowFactory to ${beneficiary}`);
        assert.strictEqual(l2EscrowTemplate.toLowerCase(), l2EscrowTemplate.toLowerCase(),    `Wrong l2EscrowFactory to ${beneficiary}`);
        assert(historicalBalanceMin.eq(ethers.BigNumber.from(0)),       `historicalBalanceMin != 0 ${beneficiary}`);
      });
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;