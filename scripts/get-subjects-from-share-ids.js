const { ethers, network } = require('hardhat');
const DEBUG = require('debug')('forta');
const utils = require('./utils');
const EthDater = require('block-by-date-ethers');
const fs = require('fs');

const INITIAL_DATE = '2022-06-14T00:00:00Z';
const END_DATE = '2022-06-14T23:59:59Z';

async function logsForInterval(initialBlock, endBlock, contract, filters) {
    let logs = filters.map(() => []);
    const blockInterval = 5000;
    for (let i = initialBlock.block; i <= endBlock.block; i += blockInterval) {
        const fromBlock = i;
        const toBlock = Math.min(endBlock.block, i + blockInterval);
        console.log(fromBlock, '-', toBlock);
        for (let j = 0; j < filters.length; j++) {
            const result = await contract.queryFilter(filters[j], fromBlock, toBlock);
            logs[j] = [...logs[j], ...result];
        }
    }
    return Array.from(new Set(logs));
}

async function getShareId(provider, txHash) {
    const receipt = await provider.getTransactionReceipt(txHash);
    console.log(receipt.logs);
}

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

    const dater = new EthDater(provider);
    const initialBlock = await dater.getDate(initialDate, true);
    console.log(initialBlock);
    const endBlock = await dater.getDate(endDate, true);
    console.log(endBlock);
    const stakeDepositFilter = contracts.staking.filters.StakeDeposited(null, null);
    const transferSingleFilter = contracts.staking.filters.TransferSingle(null, ethers.constants.AddressZero, null);

    const depositLogs = await logsForInterval(initialBlock, endBlock, contracts.staking, [stakeDepositFilter, transferSingleFilter]);
    let deposits = await Promise.all(
        depositLogs.map(async (log) => {
            console.log(log);
            return {
                blockNumber: log[0].blockNumber,
                timestamp: new Date((await provider.getBlock(log[0].blockNumber)).timestamp).toUTCString(),
                subjectType: log.args.subjectType,
                subject: log.args.subject.toString(),
            };
        })
    );
    console.table(deposits);
    /*
    console.log('Writing results to:');
    const path = `./scripts/data/claims-${initialBlock.date}-${endBlock.date}.csv`;
    console.log(path);
    fs.writeFileSync(path, await converter.json2csvAsync(claims));
    */
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
