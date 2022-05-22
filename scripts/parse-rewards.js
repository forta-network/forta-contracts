const fs = require('fs');
const _ = require('lodash');

const { ethers } = require('hardhat');
const { BigNumber } = ethers;
const parseEther = ethers.utils.parseEther;
const DEBUG = require('debug')('forta');
const utils = require('./utils');
const stakingUtils = require('./utils/staking.js');
let csvToJson = require('convert-csv-to-json');

function getRewardableNodes() {
    let funnel = csvToJson.fieldDelimiter(',').getJsonFromCsv('./scripts/data/rewards_week3.csv');
    const nodes = funnel
        .map((x) => {
            console.log(x['RewardsInFORT']);
            console.log(parseEther(x['RewardsInFORT']).toString());
            console.log('---------------');
            return {
                address: ethers.utils.getAddress(x['scanner']),
                rewardsFort: parseEther(x['RewardsInFORT']),
                rewardsInShares: parseEther(x['RewardsInStakeShares']),
            };
        })
        .filter((x) => x.rewardsFort.gt(BigNumber.from('0')) || x.rewardsInShares.gt(BigNumber.from('0')))
        .map((x) => {
            return {
                ...x,
                rewardsFort: x.rewardsFort.toString(),
                rewardsInShares: x.rewardsInShares.toString(),
            };
        });
    return nodes;
}

async function main(config = {}) {
    const provider = config.provider ?? (await utils.getDefaultProvider());
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    let configName;
    if (chainId === 5) {
        configName = chainId === 5 ? '.cache-5-with-components' : `.cache-${chainId}`;
    } else {
        configName = `.cache-${chainId}`;
    }
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: configName });

    const nodes = getRewardableNodes();

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`Deployer: ${deployer.address}`);
    console.log('Rewardable Nodes:', nodes.length);

    DEBUG('----------------------------------------------------');
    const contracts =
        config.contracts ??
        (await Promise.all(
            Object.entries({
                forta: utils.attach('FortaBridgedPolygon', await CACHE.get('forta.address')).then((contract) => contract.connect(deployer)),
                //agents: utils.attach('AgentRegistry',  await CACHE.get('agents.address')  ).then(contract => contract.connect(deployer)),
                scanners: utils.attach('ScannerRegistry', await CACHE.get('scanners.address')).then((contract) => contract.connect(deployer)),
                staking: utils.attach('FortaStaking', await CACHE.get('staking.address')).then((contract) => contract.connect(deployer)),
            }).map((entry) => Promise.all(entry))
        ).then(Object.fromEntries));

    const data = nodes.map((item) => {
        return {
            ...item,
            activeShareId: stakingUtils.subjectToActive(0, item.address).toString(),
            callOwner: contracts.scanners.interface.encodeFunctionData('ownerOf', [item.address]),
        };
    });

    const items = [];
    const owners = await Promise.all(
        data.chunk(50).map((chunk) => {
            items.push(chunk);
            const calls = chunk.map((x) => x.callOwner);
            return contracts.scanners.callStatic.multicall(calls);
        })
    );
    const result = _.zip(
        items.flat(),
        owners.flat().map((x) => ethers.utils.hexDataSlice(x, 12))
    ).map((x) => {
        return { ...x[0], owner: ethers.utils.getAddress(x[1]) };
    });

    // console.log(result)
    fs.writeFileSync(`./scripts/data/rewards_week3_result.json`, JSON.stringify(result));
    const fortToSend = result.map((x) => BigNumber.from(x.rewardsFort)).reduce((prev, curr) => prev.add(curr), BigNumber.from('0'));
    console.log('rewardables', result.length);
    console.log('fortToSend', ethers.utils.formatEther(fortToSend));
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
