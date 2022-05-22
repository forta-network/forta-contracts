const { ethers } = require('hardhat');
const utils = require('./utils');
const DEBUG = require('debug')('forta');
const allRewards = require('./data/rewards_week3_result.json');
const { default: axios } = require('axios');

const FORTA_TOKEN_NAME = {
    1: 'Forta',
    4: 'Forta',
    5: 'Forta',
    80001: 'FortaBridgedPolygon',
    137: 'FortaBridgedPolygon',
};

const START_BLOCK = 28435043;
const END_BLOCK = 28446057;

async function getLastSent(lastBlock = END_BLOCK, tokenAddress, senderAddress) {
    const transfers = await axios.get(
        `https://api.polygonscan.com/api?module=account&action=tokentx&contractaddress=${tokenAddress}&address=${senderAddress}&startblock=${START_BLOCK}&endblock=${lastBlock}&page=1&offset=0&sort=asc&apikey=${process.env.POLYSCAN}`
    );

    return transfers.data.result;
}

const TXS = [];

async function main() {
    const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    let configName;
    if (chainId === 5) {
        configName = chainId === 5 ? './_old/.cache-5-with-components' : `.cache-${chainId}`;
    } else {
        configName = `.cache-${chainId}`;
    }
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: configName });

    const contracts = await Promise.all(
        Object.entries({
            forta: utils.attach(FORTA_TOKEN_NAME[chainId], await CACHE.get('forta.address')).then((contract) => contract.connect(deployer)),
            relayer: utils.attach('BatchRelayer', await CACHE.get('batch-relayer.address')).then((contract) => contract.connect(deployer)),
        }).map((entry) => Promise.all(entry))
    ).then(Object.fromEntries);
    const lastSent = await getLastSent(await provider.getBlockNumber(), contracts.forta.address, deployer.address);

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG('----------------------------------------------------');
    for (const rewardTx of TXS.slice(0, 1)) {
        const scanners = allRewards.filter((x) => x.owner === rewardTx.owner);
        console.log(scanners);
        console.log('scanner:', scanners[0].address);
        console.log('owner:', rewardTx.owner);
        console.log('amount:', rewardTx.amount);
        const hasReceivedFortInEpoch = lastSent.filter((x) => x.value === rewardTx.amount && ethers.utils.getAddress(x.to) === rewardTx.owner)[0];
        if (hasReceivedFortInEpoch) {
            throw new Error('Achtung');
        }

        const tx = await contracts.forta.transfer(rewardTx.owner, rewardTx.amount, {
            //maxFeePerGas: ethers.utils.parseUnits('500', 'gwei').toString(),
            //maxPriorityFeePerGas: ethers.utils.parseUnits('40', 'gwei').toString(),
        });
        console.log(await tx.wait());

        console.log('-----------');
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
