const hre = require('hardhat');
const { ethers, defender } = hre;
const DEBUG = require('debug')('forta');
const utils = require('../utils');

async function updateVersions() {
    const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();
    const configName = `${chainId === 5 ? './_old/' : ''}.cache-${chainId}${chainId === 5 ? '-with-components' : ''}`;
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: configName });

    if (!provider.network.ensAddress) {
        provider.network.ensAddress = await CACHE.get('ens-registry');
    }

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`ENS:      ${provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG('----------------------------------------------------');

    if (name !== 'hardhat' && deployer.address === '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266') {
        throw new Error('using hardhat key for other network');
    }

    const deployment = require(`./${configName}.json`);
    const contractKeys = Object.keys(deployment).filter((key) => key !== 'contracts' && !key.endsWith('pending'));

    for (const key of contractKeys) {
        const contract = deployment[key];
        console.log(key);
        if (!contract?.impl) {
            console.log('immutable');
            continue;
        }
        const version = await utils.getContractVersion(null, { address: contract.address, provider: provider });
        console.log(version);
        await CACHE.set(`${key}.impl.version`, version);
        console.log('Set');
    }
}

updateVersions()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
