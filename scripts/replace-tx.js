const { ethers } = require('hardhat');
const DEBUG                = require('debug')('forta:set-staking-threshold');
const utils                = require('./utils');

const NONCE = 146;

async function main() {
    const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });

    console.log(`Network:  ${name} (${chainId})`);
    console.log(`Deployer: ${deployer.address}`);
    console.log('----------------------------------------------------');
    if (chainId !== 80001 && chainId !== 137) {
        throw new Error('Only supported for Polygon or Mumbai');
    }

    console.log(await deployer.sendTransaction({
        nonce: NONCE,
        to: deployer.address,
        value: 0,
        // maxFeePerGas: ethers.utils.parseUnits('300', 'gwei'),
        // maxPriorityFeePerGas: ethers.utils.parseUnits('30', 'gwei'),
        gasLimit: ethers.utils.parseUnits('10000', 'gwei'),
        gasPrice: ethers.utils.parseUnits('400', 'gwei'),

    }))
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