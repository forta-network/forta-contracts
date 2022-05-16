
const fs = require('fs');
const _ = require('lodash');

const { ethers } = require('hardhat');
const { BigNumber } = ethers;
const parseEther = ethers.utils.parseEther;
const DEBUG                = require('debug')('forta');
const utils                = require('./utils');
let csvToJson = require('convert-csv-to-json');

function getRewardableNodes() {
    return require('./data/rewards_result.json')
}

function getRewardedOwners() {
    let funnel = csvToJson.fieldDelimiter(',').getJsonFromCsv("./scripts/data/export-tokenholders-for-contract-0x9ff62d1FC52A907B6DCbA8077c2DDCA6E6a9d3e1.csv");
    console.log(funnel)
    const nodes = funnel.map(x => {
        return {
            owner: x['HolderAddress'],
            balance: x['Balance']
        }
    })

    return nodes
}

async function main(config = {}) {
    const provider = config.provider ?? await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    let configName;
    if (chainId === 5) {
        configName = chainId === 5 ? '.cache-5-with-components' : `.cache-${chainId}`;
    } else {
        configName = `.cache-${chainId}`;
    }
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: configName });
    const childChainManagerProxy = chainId === 31337 ? false : config.childChainManagerProxy ?? CHILD_CHAIN_MANAGER_PROXY[chainId];

    const nodes = getRewardableNodes()
    const rewarded = getRewardedOwners()
    const rewardedNodes = nodes.map(node => {
        return {
            ...node,
            reward: rewarded.filter( x => x.owner.toLowerCase() === node.owner.toLowerCase())[0]
        }
    })
    const owners = new Set(rewarded.map(x => x.owner))
    console.log('owners', owners.size)
    console.log(rewardedNodes.length)

    const notRewarded = rewardedNodes.filter(x => !x.reward.balance)
    console.log('Not rewarded:', notRewarded)

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`Deployer: ${deployer.address}`);

    DEBUG('----------------------------------------------------');
    const contracts = config.contracts ?? await Promise.all(Object.entries({
        //forta: utils.attach(childChainManagerProxy ? 'FortaBridgedPolygon' : 'Forta',  await CACHE.get('forta.address') ).then(contract => contract.connect(deployer)),
        //agents: utils.attach('AgentRegistry',  await CACHE.get('agents.address')  ).then(contract => contract.connect(deployer)),
        //scanners: utils.attach('ScannerRegistry',await CACHE.get('scanners.address')  ).then(contract => contract.connect(deployer)),
        //staking: utils.attach('FortaStaking',await CACHE.get('staking.address')  ).then(contract => contract.connect(deployer)),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries);
    
    
    
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;

