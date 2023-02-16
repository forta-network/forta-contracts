const { appendFileSync } = require('fs');
const { execSync } = require('child_process');
const { task } = require('hardhat/config');
const {
    getUpgradesConfig,
    getUpgradeOutputwriter,
    getDeploymentInfo,
    formatParams,
    getMultisigAddress,
    parseAddress,
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

async function prepareUpgrade(hre, name, upgradesConfig, deploymentInfo, multisigAddress, outputWriter) {
    console.log(`Deploying new implementation for contract ${name} ...`);
    const { opts } = prepareParams(upgradesConfig, name, deploymentInfo, multisigAddress);
    const proxyAddress = parseAddress(deploymentInfo, kebabize(name));

    const cf = await hre.ethers.getContractFactory(name)
    console.group("Summary for prepareUpgrade")
    console.log({
        proxyAddress,
        opts
    })

    const result = await hre.upgrades.prepareUpgrade(proxyAddress, cf, opts);
    const implAddress = getNewImplementation(result);
    console.log('Saving output...');
    await saveImplementation(
        outputWriter,
        name,
        opts.constructorArgs,
        null,
        implAddress,
        await getContractVersion(hre, null, { address: proxyAddress, provider: hre.ethers.provider })
    );
}

function prepareParams(upgradesConfig, name, deploymentInfo, multisigAddress) {
    const params = upgradesConfig[name].impl;
    if (!params) {
        throw new Error('No impl info');
    }
    if (!params.opts['constructor-args']) {
        throw new Error('No constructor args, if none set []');
    }
    const constructorArgs = formatParams(deploymentInfo, params.opts['constructor-args']);
    for (const key of Object.keys(params.opts)) {
        params.opts[camelize(key)] = params.opts[key];
    }
    params.opts.constructorArgs = formatParams(deploymentInfo, constructorArgs);
    const opts = {
        kind: 'uups',
        multisig: multisigAddress,
        ...params.opts,
    };
    return { opts, params, constructorArgs };
}

function saveResults(hre, chainId, args) {
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
    const deploymentInfo = getDeploymentInfo(chainId);
    const multisigAddress = getMultisigAddress(chainId);

    if (contractNames.length === 0) {
        throw new Error('No contracts in upgrade.json config file');
    }
    console.log(`Deploying implementation contracts ${contractNames.join(', ')} from commit ${commit} on chain ${chainId}`);

    console.log({
        commit,
        chainId,
        upgradesConfig,
        contractNames,
        deploymentInfo,
        multisigAddress,
        message: "prepare-upgrade summary"
    })

    try {
        for (const name of contractNames) {
            await prepareUpgrade(hre, name, upgradesConfig, deploymentInfo, multisigAddress, outputWriter);
        }
    } finally {
        saveResults(hre, chainId, args);
    }
}

task('prepare-upgrade')
    .addPositionalParam('release', 'Release number (used to load /<release>/<network>/config/deploy.json)')
    .setDescription('Deploys new implementation contracts')
    .setAction(main);
