const { execSync } = require('child_process');
const { task } = require('hardhat/config');
const { getDeployed } = require('../scripts/utils/deploymentFiles');

async function verifyEtherscan(hre, name, address, errs) {
    console.log(`\nVerifying source for ${name} at ${address} on Etherscan`);

    try {
        await hre.run('verify:verify', { address: address, noCompile: true });
    } catch (err) {
        if (err.message === 'Contract source code already verified') {
            console.log(`Source code already verified`);
        } else {
            console.log(`Error verifying source code: ${err.message}`);
            errs.push([name, err]);
        }
    }
}

async function verifyDefender(hre, name, address, workflowUrl, errs) {
    console.error(`\nVerifying artifact for ${name} at ${address} on Defender`);
    try {
        const response = await hre.defender.verifyDeployment(address, name, workflowUrl);
        console.error(`Bytecode match for ${name} is ${response.matchType}`);
    } catch (err) {
        console.error(`Error verifying artifact: ${err.message}`);
        errs.push([name, err]);
    }
}

async function main(args, hre) {
    const workflowUrl = args.referenceUrl || process.env.ARTIFACT_REFERENCE_URL || execSync(`git config --get remote.origin.url`).toString().trim();
    const chainId = await hre.ethers.provider.getNetwork().then((n) => n.chainId);
    const deployed = getDeployed(chainId, args.release) || {};

    const errs = [];

    // On Etherscan, we verify the proxy address, since the Defender upgrades plugin
    // will automatically verify both proxy and implementation. However, if we only
    // deployed an implementation, we want to verify it as well.
    for (const [name, info] of Object.entries(deployed)) {
        const addressToVerify = info.impl ? info.impl.address : info.address;
        await verifyEtherscan(hre, name, addressToVerify, errs);
    }

    // On Defender, we only care about implementation contracts for verifying bytecode.
    for (const [name, info] of Object.entries(deployed)) {
        const addressToVerify = info.impl ? info.impl.address : info.address;
        await verifyDefender(hre, name, addressToVerify, workflowUrl, errs);
    }

    if (errs.length > 0) {
        throw new Error(`Some verifications failed:\n${errs.map(([name, err]) => `${name}: ${err.message}`)}`);
    }
}

task('verify-deployed')
    .addOptionalParam('referenceUrl', 'URL to link to for artifact verification (defaults to $ARTIFACT_REFERENCE_URL the remote.origin.url of the repository)')
    .setDescription('Verifies deployed implementations in Etherscan and Defender')
    .setAction(main);
