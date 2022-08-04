const { ethers, network } = require('hardhat');
const DEBUG = require('debug')('forta');
const utils = require('./utils');
const stakingUtils = require('./utils/staking.js');

const fs = require('fs');

const INITIAL_DATE = '2022-03-28T00:00:00Z';
const END_DATE = '2022-04-10T00:00:00Z'; //new Date().toISOString();

async function getClaimStats(config = {}) {
    const initialDate = config.startDate ?? INITIAL_DATE;
    const endDate = config.endDate ?? END_DATE;
    const provider = await utils.getDefaultProvider();
    let deployer = ethers.Wallet.fromMnemonic(process.env[`${network.name.toUpperCase()}_MNEMONIC`]);
    deployer = deployer.connect(provider);
    // await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    const deployment = require(`./.cache-${chainId}`);

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG('----------------------------------------------------');

    const contracts = await Promise.all(
        Object.entries({
            staking: utils.attach('FortaStaking', deployment.staking.address).then((contract) => contract.connect(deployer)),
        }).map((entry) => Promise.all(entry))
    ).then(Object.fromEntries);

    const filters = {};
    filters['stakeDeposit'] = contracts.staking.filters.StakeDeposited(null, null);
    //filters['shareMinting'] = contracts.staking.filters.TransferSingle(null, ethers.constants.AddressZero, null);

    const depositLogs = await utils.getEventsForTimeInterval(provider, initialDate, endDate, contracts.staking, filters);
    console.log(depositLogs);
    let deposits = await Promise.all(
        depositLogs.stakeDeposit.map(async (log) => {
            console.log(log);
            return {
                // blockNumber: log.args.blockNumber,
                // timestamp: new Date((await provider.getBlock(log.args.blockNumber)).timestamp).toUTCString(),
                subjectType: log.args.subjectType,
                subject: log.args.subject.toString(),
                activeSharesId: stakingUtils.subjectToActive(log.args.subjectType, log.args.subject.toString()).toString(),
                inactiveSharesId: stakingUtils.subjectToInactive(log.args.subjectType, log.args.subject.toString()).toString(),
            };
        })
    );
    deposits = Array.from(new Set(deposits));
    console.table(deposits);

    console.log('Writing results to:');
    const path = `./scripts/data/share-ids-${initialDate}-${endDate}.json`;
    console.log(path);
    fs.writeFileSync(path, JSON.stringify(deposits));
}

if (require.main === module) {
    getClaimStats()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = getClaimStats;
