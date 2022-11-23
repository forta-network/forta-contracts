const { ethers, upgrades } = require('hardhat');
const DEBUG = require('debug')('forta:migration');
const utils = require('../utils');

upgrades.silenceWarnings();

/*********************************************************************************************************************
 *                                                Migration workflow                                                 *
 *********************************************************************************************************************/
async function deployBatchRelayer(config = {}) {
    const provider = config?.provider ?? config?.deployer?.provider ?? (await utils.getDefaultProvider());
    const deployer = config?.deployer ?? (await utils.getDefaultDeployer(provider));
    const { name, chainId } = await provider.getNetwork();
    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`Balance:  ${await provider.getBalance(deployer.address).then(ethers.utils.formatEther)}${ethers.constants.EtherSymbol}`);
    DEBUG('----------------------------------------------------');
    utils.assertNotUsingHardhatKeys(chainId, deployer);
    let configName;
    if (chainId === 5) {
        configName = chainId === 5 ? './_old/.cache-5-with-components' : `.cache-${chainId}`;
    } else {
        configName = `.cache-${chainId}`;
    }
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: configName });

    const batchRelayer = await ethers.getContractFactory('BatchRelayer', deployer).then((factory) => utils.tryFetchContract(CACHE, 'batch-relayer', factory, []));

    console.log('Batch Relayer: ', batchRelayer.address);
    return batchRelayer;
}

if (require.main === module) {
    deployBatchRelayer()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = deployBatchRelayer;
