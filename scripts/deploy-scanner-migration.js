const { ethers, upgrades } = require('hardhat');
const DEBUG = require('debug')('forta:migration');
const utils = require('./utils');
const { MIGRATION_DURATION } = require('./loadEnv');

async function deploy() {
    const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    const configName = `${chainId === 5 ? './_old/' : ''}.cache-${chainId}${chainId === 5 ? '-with-components' : ''}`;
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: configName });
    const deployment = require(configName);

    console.log(`Network:  ${name} (${chainId})`);
    console.log(`Deployer: ${deployer.address}`);
    console.log('----------------------------------------------------');
    DEBUG(`Deploying ScannerToNodeRunnerMigration...`);
    const registryMigration = await ethers.getContractFactory('ScannerToNodeRunnerMigration', deployer).then((factory) =>
        utils.tryFetchProxy(CACHE, 'node-runner-migration', factory, 'uups', [deployment.access.address], {
            constructorArgs: [deployment.forwarder.address, deployment.scanners.address, deployment['node-runners'].address],
            unsafeAllow: 'delegatecall',
        })
    );

    DEBUG(`[12] scannerToNodeRunnerMigration: ${registryMigration.address}`);
}

if (require.main === module) {
    deploy()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = deploy;
