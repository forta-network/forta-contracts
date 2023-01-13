const { execSync } = require('child_process');
const { appendFileSync } = require('fs');
const {
    saveImplementation,
    saveNonUpgradeable,
    getDeployConfig,
    getDeployOutputwriter,
    getDeployment,
    setAddressesInParams,
    getDeployed,
} = require('../scripts/utils/deploymentFiles');
const { tryFetchContract, tryFetchProxy, getBlockExplorerDomain, getContractVersion } = require('../scripts/utils/contractHelpers');
const { camelize } = require('../scripts/utils/stringUtils');

const summaryPath = process.env.GITHUB_STEP_SUMMARY;

async function deployNonUpgradeable(params, deployment, contract, hre, name, outputWriter) {
    if (!params['constructor-args']) {
        throw new Error('No constructor args, if none set []');
    }
    const constructorArgs = setAddressesInParams(deployment, params['constructor-args']);
    console.log('Non upgradeable');
    contract = await tryFetchContract(hre, name, constructorArgs, outputWriter);
    console.log('Saving output...');
    await saveNonUpgradeable(outputWriter, name, constructorArgs, contract.address, await getContractVersion(hre, contract));
    return contract;
}

async function deployUpgradeable(params, deployment, contract, hre, name, outputWriter, upgrades) {
    console.log('Upgradeable');
    if (!params.impl['init-args']) {
        throw new Error('No init args, if none set []');
    }
    if (!params.impl?.opts['constructor-args']) {
        throw new Error('No constructor args, if none set []');
    }
    const initArgs = setAddressesInParams(deployment, params.impl['init-args']);
    for (const key of Object.keys(params.impl.opts)) {
        params.impl.opts[camelize(key)] = params.impl.opts[key];
    }
    params.impl.opts.constructorArgs = setAddressesInParams(deployment, params.impl.opts.constructorArgs);
    contract = await tryFetchProxy(hre, name, 'uups', initArgs, params.impl.opts, outputWriter);
    const implAddress = await upgrades.erc1967.getImplementationAddress(contract.address);
    console.log('Saving output...');
    await saveImplementation(outputWriter, name, params.impl.opts.constructorArgs, initArgs, implAddress, await getContractVersion(hre, contract));
    return contract;
}

async function main(args, hre) {
    const { ethers, upgrades } = hre;

    const commit = execSync(`/usr/bin/git log -1 --format='%H'`).toString().trim();
    const chainId = await ethers.provider.getNetwork().then((n) => n.chainId);

    console.log(`Deploying contracts from commit ${commit} on chain ${chainId}`);

    const deploymentConfig = getDeployConfig(chainId, args.release);
    const contractNames = Object.keys(deploymentConfig);
    const outputWriter = getDeployOutputwriter(chainId, args.release);
    const deployment = getDeployment(chainId);

    let contract;

    try {
        for (const name of contractNames) {
            console.log('Deploying ', name, '...');
            const params = deploymentConfig[name];
            if (params.impl) {
                contract = await deployUpgradeable(params, deployment, contract, hre, name, outputWriter, upgrades);
            } else {
                contract = await deployNonUpgradeable(params, deployment, contract, hre, name, outputWriter);
            }
        }
    } finally {
        console.log('Results:');
        const deployed = getDeployed(chainId, args.release);
        if (deployed && Object.entries(deployed).length > 0) {
            const list = Object.entries(deployed)
                .filter(([key, info]) => !key.includes('-deploy-tx'))
                .map(([key, info]) => {
                    let result = `
                    - ${key} at [\`${info.address}\`](https://${getBlockExplorerDomain(hre)}/address/${info.address})`;
                    if (info.impl) {
                        result += ` with implementation at [\`${info.impl.address}\`](https://${getBlockExplorerDomain(hre)}/address/${info.impl.address})`;
                    }
                    return result;
                });
            const resultText = `## Contract deployed\n\n${list.join('\n')}\n`;
            if (summaryPath) {
                appendFileSync(summaryPath, resultText);
            }
            console.log(resultText);
        }
    }
}

task('deploy')
    .addPositionalParam('release', 'Release number (used to load /<release>/<network>/config/deploy.json)')
    .setDescription(
        `Deploys the contracts as described in the correspondent deploy.json config.
        Works both with non-upgradeable and uups upgradeable contracts.
        Results are tracked in /<release>/<network>/deployed/deployed.json
        `
    )
    .setAction(main);
