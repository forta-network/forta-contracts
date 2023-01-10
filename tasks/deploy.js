const { execSync } = require('child_process');
const { appendFileSync } = require('fs');
const { saveImplementation, saveNonUpgradeable, getDeployConfig, getReleaseOutputWriter, getDeployment, setAddressesInParams } = require('../scripts/utils/deploymentFiles');
const { tryFetchContract, tryFetchProxy, getBlockExplorerDomain, getContractVersion } = require('../scripts/utils/contractHelpers');
const { camelize } = require('../scripts/utils/stringUtils');

const summaryPath = process.env.GITHUB_STEP_SUMMARY;

async function main(args, hre) {
    const { ethers, upgrades } = hre;

    const commit = execSync(`/usr/bin/git log -1 --format='%H'`).toString().trim();
    const chainId = await ethers.provider.getNetwork().then((n) => n.chainId);

    console.log(`Deploying contracts from commit ${commit} on chain ${chainId}`);

    const deploymentConfig = getDeployConfig(chainId, args.release);
    const contractNames = Object.keys(deploymentConfig);
    const outputWriter = getReleaseOutputWriter(chainId, args.release);
    const deployment = getDeployment(chainId);

    let contract, implAddress;

    try {
        for (const name of contractNames) {
            console.log('Deploying ', name, '...');
            const params = deploymentConfig[name];
            if (params.proxy) {
                console.log('Upgradeable');
                if (!params.proxy['init-args']) {
                    throw new Error('No init args, if none set []');
                }
                if (!params.proxy?.opts['constructor-args']) {
                    throw new Error('No constructor args, if none set []');
                }
                const initArgs = setAddressesInParams(deployment, params.proxy['init-args']);
                for (const key of Object.keys(params.proxy.opts)) {
                    params.proxy.opts[camelize(key)] = params.proxy.opts[key];
                }
                params.proxy.opts.constructorArgs = setAddressesInParams(deployment, params.proxy.opts.constructorArgs);
                contract = await tryFetchProxy(hre, name, 'uups', initArgs, params.proxy.opts, outputWriter);
                implAddress = await upgrades.erc1967.getImplementationAddress(contract.address);
                console.log('Saving output...');
                await saveImplementation(outputWriter, name, params.proxy.opts.constructorArgs, initArgs, implAddress, await getContractVersion(hre, contract));
            } else {
                if (!params['constructor-args']) {
                    throw new Error('No constructor args, if none set []');
                }
                const constructorArgs = setAddressesInParams(deployment, params['constructor-args']);
                console.log('Non upgradeable');
                contract = await tryFetchContract(hre, name, constructorArgs, outputWriter);
                console.log('Saving output...');
                await saveNonUpgradeable(outputWriter, name, constructorArgs, contract.address, await getContractVersion(hre, contract));
            }
        }
    } finally {
        let deployed = await outputWriter.get('');
        if (summaryPath && deployed && Object.entries(deployed).length > 0) {
            const list = Object.entries(deployed).map(([name, info]) => {
                let result = `
                    - ${name} at [\`${contract.address}\`](https://${getBlockExplorerDomain(hre)}/address/${contract.address})`;
                if (info.impl) {
                    result += ` with implementation at [\`${implAddress}\`](https://${getBlockExplorerDomain(hre)}/address/${implAddress})`;
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
