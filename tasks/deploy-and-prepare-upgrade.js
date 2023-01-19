const { task } = require('hardhat/config');
const { deployConfigExists, upgradeConfigExists } = require('../scripts/utils/deploymentFiles');

async function main(args, hre) {
    const chainId = await hre.ethers.provider.getNetwork().then((n) => n.chainId);
    console.log('Deploy and prepare upgrade');
    console.log('Checking for deploy config...');
    if (deployConfigExists(chainId, args.release)) {
        console.log('Deploying...');
        await hre.run('deploy', { release: args.release });
    } else {
        console.log('Deploy config not present.');
    }
    if (upgradeConfigExists(chainId, args.release)) {
        console.log('Preparing upgrade...');
        await hre.run('prepare-upgrade', { release: args.release });
    } else {
        console.log('Prepare upgrade config not present');
    }
}

task('deploy-and-prepare-upgrade')
    .addPositionalParam('release', 'Release number (used to load /<release>/<network>/config/)')
    .setDescription('Deploys new contracts and implementations')
    .setAction(main);
