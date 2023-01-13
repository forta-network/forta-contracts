const appendFileSync = require('fs');
const execSync = require('child_process');
const task = require('hardhat/config');
const {
    getUpgradesConfig,
    getUpgradeOutputwriter,
    getDeployment,
    setAddressesInParams,
    getMultisigAddress,
    getProxyOrContractAddress,
    saveImplementation,
    getDeployedImplementations,
} = require('../scripts/utils/deploymentFiles');
const { camelize, kebabize } = require('../scripts/utils/stringUtils');
const { getBlockExplorerDomain, getContractVersion } = require('../scripts/utils/contractHelpers');

const { getContractAddress } = require('@ethersproject/address');

const summaryPath = process.env.GITHUB_STEP_SUMMARY;

function getNewImplementation(prepareUpgradeResult) {
    return typeof prepareUpgradeResult === 'string' ? prepareUpgradeResult : getContractAddress(prepareUpgradeResult);
}

async function prepareUpgrade(name, upgradesConfig, deployment, multisigAddress, hre, ethers, outputWriter) {
    console.error(`Deploying new implementation for contract ${name} ...`);
    const { opts, initArgs } = prepareParams(upgradesConfig, name, deployment, multisigAddress);
    const proxyAddress = getProxyOrContractAddress(kebabize(name));
    const result = await hre.upgrades.prepareUpgrade(proxyAddress, await ethers.getContractFactory(name), opts);
    const implAddress = getNewImplementation(result);
    console.log('Saving output...');
    await saveImplementation(outputWriter, name, opts.constructorArgs, initArgs, implAddress, await getContractVersion(hre, null, { proxyAddress, provider: ethers.provider }));
}

function prepareParams(upgradesConfig, name, deployment, multisigAddress) {
    const params = upgradesConfig[name].impl;
    if (!params) {
        throw new Error('No impl info');
    }
    if (!params.opts['constructor-args']) {
        throw new Error('No constructor args, if none set []');
    }
    const initArgs = setAddressesInParams(deployment, params['constructor-args']);
    for (const key of Object.keys(params.opts)) {
        params.opts[camelize(key)] = params.opts[key];
    }
    params.proxy.opts.constructorArgs = setAddressesInParams(deployment, params.opts.constructorArgs);
    const opts = {
        kind: 'uups',
        multisig: multisigAddress,
        ...params.proxy.opts,
    };
    return { opts, params, initArgs };
}

function saveResults(chainId, args, hre) {
    console.log('Results:');
    const deployed = getDeployedImplementations(chainId, args.release);
    if (deployed && Object.entries(deployed).length > 0) {
        const list = Object.entries(deployed)
            .filter(([key, info]) => !key.includes('-deploy-tx'))
            .map(([key, info]) => {
                if (info.impl) {
                    return `- ${key} at [\`${info.impl.address}\`](https://${getBlockExplorerDomain(hre)}/address/${info.impl.address})`;
                }
                return '';
            });
        const resultText = `## Implementation contracts deployed\n\n${list.join('\n')}\n`;
        if (summaryPath) {
            appendFileSync(summaryPath, resultText);
        }
        console.log(resultText);
    }
}

async function main(args, hre) {
    const { ethers } = hre;

    const commit = execSync(`/usr/bin/git log -1 --format='%H'`).toString().trim();
    const chainId = await ethers.provider.getNetwork().then((n) => n.chainId);
    const upgradesConfig = getUpgradesConfig(chainId, args.release);
    const contractNames = Object.keys(upgradesConfig);
    const outputWriter = getUpgradeOutputwriter(chainId, args.release);
    const deployment = getDeployment(chainId);
    const multisigAddress = getMultisigAddress(chainId);

    if (contractNames.length === 0) {
        throw new Error('No contracts in upgrade.json config file');
    }
    console.log(`Deploying implementation contracts ${contractNames.join(', ')} from commit ${commit} on chain ${chainId}`);

    try {
        for (const name of contractNames) {
            await prepareUpgrade(name, upgradesConfig, deployment, multisigAddress, hre, ethers, outputWriter);
        }
    } finally {
        saveResults(chainId, args, hre);
    }
}

task('prepare-upgrade')
    .addPositionalParam('release', 'Release number (used to load /<release>/<network>/config/deploy.json)')
    .setDescription('Deploys new implementation contracts')
    .setAction(main);
