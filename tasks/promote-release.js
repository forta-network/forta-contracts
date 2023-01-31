const { task } = require('hardhat/config');
const { execSync } = require('child_process');
const { appendFileSync } = require('fs');
const { getDeployReleaseWriter, getDeployed, getDeploymentOutputWriter, saveToDeployment } = require('../scripts/utils/deploymentFiles');

const summaryPath = process.env.GITHUB_STEP_SUMMARY;

async function main(args, hre) {
    const { ethers } = hre;

    const commit = execSync(`/usr/bin/git log -1 --format='%H'`).toString().trim();
    const chainId = await ethers.provider.getNetwork().then((n) => n.chainId);

    console.log(`Deploying contracts from commit ${commit} on chain ${chainId}`);

    const contractNames = Object.keys(getDeployed(chainId, args.release));
    const releaseWriter = getDeployReleaseWriter(chainId, args.release);
    const deploymentWriter = getDeploymentOutputWriter(chainId);
    for (const name of contractNames) {
        await saveToDeployment(releaseWriter, deploymentWriter, name);
    }
    const resultText = `## Promoted contracts to deployment file\n\n${contractNames.join('\n')}\n`;
    if (summaryPath) {
        appendFileSync(summaryPath, resultText);
    }
    console.log(resultText);
}

task('promote-release')
    .addPositionalParam('release', 'Release number (used to load /<release>/<network>/config/deploy.json)')
    .setDescription(
        `Copies output of /<release>/<network>/output/deployed.json to releases/deployments/<network_id>.json
        TODO: promote implementations too
        `
    )
    .setAction(main);
