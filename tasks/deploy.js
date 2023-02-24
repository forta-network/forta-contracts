const { task } = require('hardhat/config');
const { execSync } = require('child_process');
const { appendFileSync } = require('fs');
const {
    saveImplementation,
    saveNonUpgradeable,
    getDeployConfig,
    getDeployReleaseWriter,
    getDeployment,
    formatParams,
    getDeployed,
    getDeploymentOutputWriter,
    saveToDeployment,
    getDeploymentInfo,
} = require('../scripts/utils/deploymentFiles');
const { tryFetchContract, tryFetchProxy, getBlockExplorerDomain, getContractVersion } = require('../scripts/utils/contractHelpers');
const { camelize } = require('../scripts/utils/stringUtils');
const { boolean } = require('hardhat/internal/core/params/argumentTypes');

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
let promoteDeployed = false;

async function deployNonUpgradeable(params, deploymentInfo, contract, hre, name, releaseWriter, deploymentWriter) {
    if (!params['constructor-args']) {
        throw new Error('No constructor args, if none set []');
    }
    const constructorArgs = formatParams(deploymentInfo, params['constructor-args']);
    console.log('Non upgradeable');
    console.log(name);
    console.log('constructorArgs', constructorArgs);
    console.log('opts', params.impl.opts);
    contract = await tryFetchContract(hre, name, constructorArgs, releaseWriter);
    console.log('Saving output...');
    await saveNonUpgradeable(releaseWriter, name, constructorArgs, contract.address, await getContractVersion(hre, contract));
    if (promoteDeployed) {
        await saveToDeployment(releaseWriter, deploymentWriter, name);
    }
    return contract;
}

async function deployUpgradeable(params, deploymentInfo, contract, hre, name, releaseWriter, deploymentWriter, upgrades) {
    console.log('Upgradeable');
    if (!params.impl['init-args']) {
        throw new Error('No init args, if none set []');
    }
    if (!params.impl?.opts['constructor-args']) {
        throw new Error('No constructor args, if none set []');
    }
    const initArgs = formatParams(deploymentInfo, params.impl['init-args']);
    for (const key of Object.keys(params.impl.opts)) {
        params.impl.opts[camelize(key)] = params.impl.opts[key];
    }
    params.impl.opts.constructorArgs = formatParams(deploymentInfo, params.impl.opts.constructorArgs);
    params.impl.opts.timeout = 1200000
    console.log(name);
    console.log('initArgs', initArgs);
    console.log('opts', params.impl.opts);
    contract = await tryFetchProxy(hre, name, 'uups', initArgs, params.impl.opts, releaseWriter);
    const implAddress = await upgrades.erc1967.getImplementationAddress(contract.address);
    console.log('Saving output...');
    await saveImplementation(releaseWriter, name, params.impl.opts.constructorArgs, initArgs, implAddress, await getContractVersion(hre, contract));
    if (promoteDeployed) {
        console.log('saving');
        await saveToDeployment(releaseWriter, deploymentWriter, name);
    }

    return contract;
}

async function main(args, hre) {
    const { ethers, upgrades } = hre;

    const commit = execSync(`/usr/bin/git log -1 --format='%H'`).toString().trim();
    const chainId = await ethers.provider.getNetwork().then((n) => n.chainId);

    promoteDeployed = args.promotes ?? false;
    const deploymentConfig = args['manual-config'] ?? getDeployConfig(chainId, args.release);
    const contractNames = Object.keys(deploymentConfig);
    const releaseWriter = getDeployReleaseWriter(chainId, args.release);
    const deploymentInfo = getDeploymentInfo(chainId);
    const deploymentWriter = getDeploymentOutputWriter(chainId);
    console.log(`Deploying contracts ${contractNames.length} from commit ${commit} on chain ${chainId}`);

    let contract, resultText;

    try {
        for (const name of contractNames) {
            console.log('----Deploying ', name, '...');
            const params = deploymentConfig[name];
            if (params.impl) {
                contract = await deployUpgradeable(params, deploymentInfo, contract, hre, name, releaseWriter, deploymentWriter, upgrades);
            } else {
                contract = await deployNonUpgradeable(params, deploymentInfo, contract, hre, name, releaseWriter, deploymentWriter);
            }
            if (promoteDeployed) {
                deploymentInfo.deployment = getDeployment(chainId);
            }
        }
    } finally {
        console.log('Results:');
        const deployed = getDeployed(chainId, args.release);
        console.log('Deployed', deployed);
        if (deployed && Object.entries(deployed).length > 0) {
            const list = Object.entries(deployed).map(([key, info]) => {
                let result = `
                    - ${key} at [\`${info.address}\`](https://${getBlockExplorerDomain(hre)}/address/${info.address})`;
                if (info.impl) {
                    result += ` with implementation at [\`${info.impl.address}\`](https://${getBlockExplorerDomain(hre)}/address/${info.impl.address})`;
                }
                return result;
            });
            resultText = `## Contract deployed\n\n${list.join('\n')}\n`;
            if (summaryPath) {
                appendFileSync(summaryPath, resultText);
            }
            console.log(resultText);
        }
    }
    return resultText;
}

task('deploy')
    .addPositionalParam('release', 'Release number (used to load /<release>/<network>/config/deploy.json)')
    .addOptionalParam('manualConfig', 'Config object, if present the release will use this instead of deploy.json')
    .addOptionalParam('promotes', 'Copies the release "deployed.json" output to releases/deployments/<network_id>. Defaults to true', true, boolean)
    .setDescription(
        `Deploys the contracts as described in the correspondent deploy.json config.
        Works both with non-upgradeable and uups upgradeable contracts.
        Results are tracked in /<release>/<network>/output/deployed.json
        `
    )
    .setAction(main);
