const { ethers } = require('hardhat');
const DEBUG = require('debug')('forta:propose');
const utils = require('./utils');
const fs = require('fs');

async function generateProposalConfig() {
    const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    const deployment = require(`./.cache-${chainId}.json`);

    console.log(`Network:  ${name} (${chainId})`);
    console.log(`Deployer: ${deployer.address}`);
    console.log('----------------------------------------------------');

    const unstakes = require('./data/active_shares_0xC99884BE6eEE5533Be08152C40DF0464B3FAE877.json').subjectIdsAndAmounts;

    const proposal = {
        description: 'Init stake withdrawal on multiple scanners',
        methods: unstakes.map((item) => {
            return {
                contractName: 'FortaStaking',
                contractTag: 'staking',
                name: 'initiateWithdrawal',
                inputs: {
                    subjectType: '0',
                    subject: item.id,
                    sharesValue: ethers.utils.parseEther(item.amount).toString(),
                },
                value: '0',
            };
        }),
        multisig: process.env.POLYGON_MULTISIG_FUNDS,
    };

    fs.writeFileSync('./scripts/data/gnosis-proposal-config-1_unstake_fortification.json', JSON.stringify(proposal));

    console.log('Saved at', './scripts/data/gnosis-proposal-config-1_unstake_fortification.json');
}

if (require.main === module) {
    gemerateProposalConfig()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = gemerateProposalConfig;
