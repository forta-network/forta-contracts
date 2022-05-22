const { ethers, upgrades } = require('hardhat');
const DEBUG = require('debug')('forta:migration');
const utils = require('./utils');

upgrades.silenceWarnings();

async function main(config = {}) {
    const provider = config?.provider ?? config?.deployer?.provider ?? (await utils.getDefaultProvider());
    const deployer = config?.deployer ?? (await utils.getDefaultDeployer(provider));
    const { name, chainId } = await provider.getNetwork();
    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`ENS:      ${provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`Balance:  ${await provider.getBalance(deployer.address).then(ethers.utils.formatEther)}${ethers.constants.EtherSymbol}`);
    DEBUG('----------------------------------------------------');
    utils.assertNotUsingHardhatKeys(chainId, deployer);

    const CACHE_L2 = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });
    let CACHE_L1;

    switch (chainId) {
        case 80001:
            CACHE_L1 = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${5}` });
            break;
        case 137:
            CACHE_L1 = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${1}` });
            break;
        default:
            throw new Error(`Unsupported chain ${chainId}`);
    }
    const manager = deployer.address;
    const l2EscrowFactory = await utils.attach('StakingEscrowFactory', await CACHE_L2.get('escrow-factory.address'));
    const l1Vesting = await CACHE_L1.get(`vesting-${manager}.address`);
    console.log(await l2EscrowFactory.newWallet(l1Vesting, manager));
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
