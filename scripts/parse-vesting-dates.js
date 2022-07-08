const { ethers } = require('hardhat');
const DEBUG = require('debug')('forta:propose');
const utils = require('./utils');

async function main() {
    const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    const deployment = require(`./.cache-${chainId}.json`);

    console.log(`Network:  ${name} (${chainId})`);
    console.log(`Deployer: ${deployer.address}`);
    console.log('----------------------------------------------------');

    const vestingWallets = Object.keys(deployment).filter((x) => x.startsWith('vesting') && !x.endsWith('pending') && !x.includes('dummy'));
    const dates = [];
    console.log(`Checking ${vestingWallets.length} contracts...`);
    for (const vWallet of vestingWallets) {
        const beneficiary = vWallet.split('-')[1];
        const walletAddress = deployment[vWallet].address;
        const walletContract = await utils.attach('VestingWalletV1', walletAddress).then((contract) => contract.connect(deployer));
        const start = await walletContract.start();
        const cliff = await walletContract.cliff();
        const cliffDate = start.add(cliff).mul(1000);
        dates.push({
            beneficiary,
            vestingContract: walletAddress,
            cliffDate: new Date(cliffDate.toNumber()),
        });
    }
    console.table(dates);
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;
