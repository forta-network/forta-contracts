const { execSync } = require('child_process');
const { appendFileSync } = require('fs');
const { saveImplementation, saveNonUpgradeable, getDeployConfig, getReleaseOutputWriter, getDeployment, setAddressesInParams } = require('../scripts/utils/deploymentFiles');
const { tryFetchContract, tryFetchProxy, getBlockExplorerDomain, getContractVersion } = require('../scripts/utils');
const { camelize } = require('../scripts/utils/stringUtils');

const summaryPath = process.env.GITHUB_STEP_SUMMARY;

async function main(args, hre) {
    const { ethers, upgrades } = hre;

    const commit = execSync(`/usr/bin/git log -1 --format='%H'`).toString().trim();
    const chainId = await ethers.provider.getNetwork().then((n) => n.chainId);

    console.log(`Deploying contracts from commit ${commit} on chain ${chainId}`);

    const deploymentConfig = getDeployConfig(chainId, args.version);
    const contractNames = Object.keys(deploymentConfig);
    const outputWriter = getReleaseOutputWriter(chainId, args.version);
    const deployment = getDeployment(chainId);

    let contract, implAddress;
    let resultList = '## Contract deployed';
    for (const name of contractNames) {
        console.log('Deploying ', name, '...');
        const params = name[deploymentConfig];
        try {
            if (params.proxy) {
                console.log('Upgradeable');
                if (!params.proxy['init-args']) {
                    throw new Error('No init args, if none set []');
                }
                if (!params.proxy['constructor-args']) {
                    throw new Error('No constructor args, if none set []');
                }
                const initArgs = setAddressesInParams(deployment, params.proxy['init-args']);
                for (const key of Object.keys(params.proxy.opts)) {
                    params.proxy.opts[camelize(key)] = params.proxy.opts[key];
                }
                params.proxy.opts.constructorArgs = setAddressesInParams(deployment, params.proxy.opts.constructorArgs);
                contract = await tryFetchProxy(outputWriter, name, 'uups', initArgs, params.proxy.opts);
                implAddress = await upgrades.erc1967.getImplementationAddress(contract.address);
                console.log('Saving output...');
                await saveImplementation(outputWriter, name, params.proxy.opts.constructorArgs, initArgs, implAddress, await getContractVersion(contract));
            } else {
                if (!params['constructor-args']) {
                    throw new Error('No constructor args, if none set []');
                }
                const constructorArgs = setAddressesInParams(deployment, params.proxy.opts.constructorArgs);
                console.log('Non upgradeable');
                contract = await tryFetchContract(outputWriter, name, constructorArgs);
                console.log('Saving output...');
                await saveNonUpgradeable(outputWriter, name, constructorArgs, contract.address, await getContractVersion(contract));
            }
        } finally {
            if (summaryPath) {
                resultList += `
                - ${name} at [\`${contract.address}\`](https://${getBlockExplorerDomain(hre)}/address/${contract.address})`;
                if (implAddress) {
                    resultList += ` with implementation at [\`${implAddress}\`](https://${getBlockExplorerDomain(hre)}/address/${implAddress})`;
                }
            }
        }
    }
    appendFileSync(summaryPath, resultList);
}

task('deploy')
    .addPositionalParam('version', 'Version number (used to load /<version>/<network>/config/deploy.json)')
    .setDescription(
        `Deploys the contracts as described in the correspondent deploy.json config.
        Works both with non-upgradeable and uups upgradeable contracts.
        Results are tracked in /<version>/<network>/deployed/deployed.json
        `
    )
    .setAction(main);
