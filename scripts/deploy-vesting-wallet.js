const { ethers, upgrades } = require('hardhat');
const DEBUG = require('debug')('forta:migration');
const utils = require('./utils');
const assert = require('assert');

upgrades.silenceWarnings();

const ROOT_CHAIN_MANAGER = {
    1: '0xA0c68C638235ee32657e8f720a23ceC1bFc77C77',
    5: '0xBbD7cBFA79faee899Eaf900F13C9065bF03B1A74',
};

const allocations = require('./CONFIG.js').allocations_13072022_2;

const MODE = 'DEPLOY';

async function main(config = {}) {
    const provider = config?.provider ?? config?.deployer?.provider ?? (await utils.getDefaultProvider());
    const deployer = config?.deployer ?? (await utils.getDefaultDeployer(provider));
    const { name, chainId } = await provider.getNetwork();
    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`ENS:      ${provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`Balance:  ${await provider.getBalance(deployer.address).then(ethers.utils.formatEther)}${ethers.constants.EtherSymbol}`);
    DEBUG(allocations);

    DEBUG(`Mode: ${MODE}`);
    DEBUG('----------------------------------------------------');
    utils.assertNotUsingHardhatKeys(chainId, deployer);

    const CACHE_L1 = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });
    let CACHE_L2;
    const parameters = allocations.map((allocation) => {
        return {
            beneficiary: allocation.beneficiary,
            upgrader: allocation.upgrader,
            start: utils.dateToTimestamp(allocation.start),
            cliff: utils.durationToSeconds(allocation.cliff),
            duration: utils.durationToSeconds(allocation.duration),
            vestingWalletTag: allocation.deploymentForBeneficiary ? `vesting-${allocation.beneficiary}-${allocation.deploymentForBeneficiary}` : `vesting-${allocation.beneficiary}`,
        };
    });

    DEBUG(parameters);
    const l1Token = await CACHE_L1.get('forta.address');

    let rootChainManager;
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
    DEBUG('l1Token', l1Token);
    DEBUG('rootChainManager', rootChainManager);

    const l2EscrowFactory = await CACHE_L2.get('escrow-factory.address');
    const l2EscrowTemplate = await CACHE_L2.get('escrow-template.address');
    DEBUG('l2EscrowFactory', l2EscrowFactory);
    DEBUG('l2EscrowTemplate', l2EscrowTemplate);
    const constructorArgs = [rootChainManager, l1Token, l2EscrowFactory, l2EscrowTemplate];
    var index = 0;
    for (const params of parameters) {
        console.log('Deploying for:', params.beneficiary);
        DEBUG('Params');
        DEBUG(params);
        DEBUG('Constructor Args');
        DEBUG(constructorArgs);
        let vesting;
        if (MODE === 'DEPLOY') {
            vesting = await ethers.getContractFactory('VestingWalletV2', deployer).then((factory) =>
                utils.tryFetchProxy(CACHE_L1, params.vestingWalletTag, factory, 'uups', [params.beneficiary, params.upgrader, params.start, params.cliff, params.duration], {
                    constructorArgs: constructorArgs,
                    unsafeAllow: 'delegatecall',
                })
            );
        } else if (MODE === 'UPGRADE') {
            vesting = await utils.performUpgrade(
                await utils.attach('VestingWalletV2', await CACHE_L1.get(`${params.vestingWalletTag}.address`)),
                await ethers.getContractFactory('VestingWalletV2', deployer),
                {
                    constructorArgs: constructorArgs,
                    unsafeAllow: 'delegatecall',
                },
                CACHE_L1,
                params.vestingWalletTag
            );
        } else if (MODE === 'CHECK') {
            vesting = await utils.attach('VestingWalletV2', await CACHE_L1.get(`${params.vestingWalletTag}.address`));
        }
        if (MODE !== 'DRY-RUN') {
            console.log('Deployed vesting wallet:', vesting.address);
            console.log('Post deployment checks...');

            const results = await Promise.all([
                vesting.start(),
                vesting.cliff(),
                vesting.duration(),
                vesting.beneficiary(),
                vesting.owner(),
                vesting.rootChainManager(),
                vesting.l1Token(),
                vesting.l2EscrowFactory(),
                vesting.l2EscrowTemplate(),
                vesting.historicalBalanceMin(),
            ]);
            const [start, cliff, duration, beneficiary, owner, vRootChainManager, vL1Token, vL2EscrowFactory, vL2EscrowTemplate, historicalBalanceMin] = results;
            DEBUG('start', `expected: ${utils.dateToTimestamp(allocations[index].start)}`, `actual: ${start}`);
            assert(start.eq(utils.dateToTimestamp(allocations[index].start)), `Wrong start for vested allocation to ${beneficiary}`);
            DEBUG('cliff', `expected: ${utils.durationToSeconds(allocations[index].cliff)}`, `actual: ${cliff}`);
            assert(cliff.eq(utils.durationToSeconds(allocations[index].cliff)), `Wrong cliff for vested allocation to ${beneficiary}`);
            DEBUG('duration', `expected: ${utils.durationToSeconds(allocations[index].duration)}`, `actual: ${duration}`);
            assert(duration.eq(utils.durationToSeconds(allocations[index].duration)), `Wrong duration for vested allocation to ${beneficiary}`);
            DEBUG('beneficiary', `expected: ${allocations[index].beneficiary.toLowerCase()}`, `actual: ${beneficiary.toLowerCase()}`);
            assert.strictEqual(beneficiary.toLowerCase(), allocations[index].beneficiary.toLowerCase(), `Wrong beneficiary for vested allocation to ${beneficiary}`);
            assert.strictEqual(owner.toLowerCase(), allocations[index].upgrader.toLowerCase(), `Wrong admin for direct allocation to ${beneficiary}`);
            assert.strictEqual(vRootChainManager.toLowerCase(), rootChainManager.toLowerCase(), `Wrong rootChainManager for ${beneficiary}`);
            assert.strictEqual(vL1Token.toLowerCase(), l1Token.toLowerCase(), `Wrong l1Token for direct allocation to ${l1Token}`);
            assert.strictEqual(vL2EscrowFactory.toLowerCase(), l2EscrowFactory.toLowerCase(), `Wrong l2EscrowFactory to ${beneficiary}`);
            assert.strictEqual(vL2EscrowTemplate.toLowerCase(), l2EscrowTemplate.toLowerCase(), `Wrong l2EscrowFactory to ${beneficiary}`);
            assert(historicalBalanceMin.eq(ethers.BigNumber.from(0)), `historicalBalanceMin != 0 ${beneficiary}`);
            console.log('Checks!...');
        }

        index++;
    }
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;
