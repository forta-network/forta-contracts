const { ethers } = require('hardhat');
const { BigNumber } = ethers;
const parseEther = ethers.utils.parseEther;
const _ = require('lodash');
const utils = require('./utils');
const DEBUG = require('debug')('forta');
const fs = require('fs');
const rewardables = require('./data/rewards_result.json');

const FORTA_TOKEN_NAME = {
    1: 'Forta',
    4: 'Forta',
    5: 'Forta',
    80001: 'FortaBridgedPolygon',
    137: 'FortaBridgedPolygon',
};

const CHUNK_SIZE = 50;

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

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG('----------------------------------------------------');
    const calculateRewardsToSend = (rewards) => {
        const rewardsNumber = ethers.BigNumber.from(rewards);
        const stakeAmount = parseEther('500');
        if (rewardsNumber.lt(stakeAmount)) {
            return rewards;
        } else {
            return rewardsNumber.sub(stakeAmount).toString();
        }
    };
    console.log('Rewardables:', rewardables.length);
    const toSendFort = rewardables.map((x) => {
        return {
            owner: x.owner,
            address: x.address,
            toSend: calculateRewardsToSend(x.rewards),
            originalRewards: x.rewards,
            balanceCall: contracts.forta.interface.encodeFunctionData('balanceOf', [x.owner]),
        };
    });
    console.log('toSendFort:', toSendFort.length);

    const balancesQuery = (
        await Promise.all(
            toSendFort.chunk(CHUNK_SIZE).map((chunk) => {
                return contracts.relayer.callStatic.relay(
                    contracts.forta.address,
                    chunk.map((x) => x.balanceCall)
                );
            })
        )
    ).flat();
    console.log('balancesQuery:', balancesQuery.length);

    const notSentYet = _.zip(toSendFort, balancesQuery)
        .map((x) => {
            return {
                ...x[0],
                currentBalance: BigNumber.from(x[1]),
            };
        })
        .filter((x) => x.currentBalance.lt(BigNumber.from(x.toSend)));

    console.log('notSentYet:', notSentYet.length);
    const totalFortToSend = notSentYet.reduce((prev, next) => prev.add(BigNumber.from(next.toSend)), BigNumber.from('0'));
    console.log('totalFortToSend:', ethers.utils.formatEther(totalFortToSend));

    const calldatas = notSentYet.map((x) => {
        return contracts.forta.interface.encodeFunctionData('transferFrom', [deployer.address, x.owner, x.toSend]);
    });

    const receipts = await Promise.all(
        calldatas.chunk(CHUNK_SIZE).map((chunk) => {
            return contracts.relayer.relay(contracts.forta.address, chunk).then((tx) => tx.wait());
        })
    );

    console.log(receipts);
    console.log('Sent!');
    const resultBalancesQuery = (
        await Promise.all(
            toSendFort.chunk(CHUNK_SIZE).map((chunk) => {
                return contracts.relayer.callStatic.relay(
                    contracts.forta.address,
                    chunk.map((x) => x.balanceCall)
                );
            })
        )
    ).flat();
    console.log('resultBalancesQuery:', resultBalancesQuery.length);

    const sent = _.zip(toSendFort, resultBalancesQuery).map((x) => {
        return {
            ...x[0],
            currentBalance: x[1],
        };
    });
    fs.writeFileSync(`./scripts/data/fort_sent_${Date.now()}.json`, JSON.stringify(sent));
    /*
    sent.forEach( x => {
        if (!BigNumber.from(x.currentBalance).eq(BigNumber.from(x.toSend))) {
            console.log(x)
            throw new Error('discrepancy', x)
        }
    })*/

    console.log('Ssaved');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
