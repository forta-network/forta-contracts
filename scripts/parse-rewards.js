
const fs = require('fs');
const _ = require('lodash');

const { ethers } = require('hardhat');
const { BigNumber } = ethers;
const parseEther = ethers.utils.parseEther;
const DEBUG                = require('debug')('forta');
const utils                = require('./utils');
const stakingUtils = require('./utils/staking.js');
let csvToJson = require('convert-csv-to-json');

const CHILD_CHAIN_MANAGER_PROXY = {
    137:   '0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa',
    80001: '0xb5505a6d998549090530911180f38aC5130101c6',
};

const MULTISIG = process.env.POLYGON_MULTISIG_FUNDS;

function getRewardableNodes() {
    let funnel = csvToJson.fieldDelimiter(',').getJsonFromCsv("./scripts/data/rewards.csv");
    const nodes = funnel.map(x => {
        return {
            address: x['Address'],
            rewards: parseEther(x['TotalRewards'])
        }
    }).filter(x => x.rewards.gt(BigNumber.from('0')))
    .map(x => {
        const n = {...x}
        n.rewardsMinusStake = x.rewards.sub(parseEther('500')).toString()
        n.rewards = x.rewards.toString()
        return n
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

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`Multisig: ${MULTISIG}`);
    console.log('Rewardable Nodes:', nodes.length)

    DEBUG('----------------------------------------------------');
    const contracts = config.contracts ?? await Promise.all(Object.entries({
        forta: utils.attach(childChainManagerProxy ? 'FortaBridgedPolygon' : 'Forta',  await CACHE.get('forta.address') ).then(contract => contract.connect(deployer)),
        //agents: utils.attach('AgentRegistry',  await CACHE.get('agents.address')  ).then(contract => contract.connect(deployer)),
        scanners: utils.attach('ScannerRegistry',await CACHE.get('scanners.address')  ).then(contract => contract.connect(deployer)),
        staking: utils.attach('FortaStaking',await CACHE.get('staking.address')  ).then(contract => contract.connect(deployer)),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries);
    
    const data = nodes
        .map(item => {
            return {
                ...item,
                activeShareId: stakingUtils.subjectToActive(0, item.address).toString(),
                callOwner: contracts.scanners.interface.encodeFunctionData('ownerOf', [item.address])
            }
        })
    
    const items = []
    const owners = await Promise.all(
        data.chunk(100)
        .map(chunk => {
            items.push(chunk)
            const calls = chunk.map(x => x.callOwner)
            return contracts.scanners.callStatic.multicall(calls)
        }))
    const result = _.zip(items.flat(), owners.flat().map(x => ethers.utils.hexDataSlice(x, 12))).map(x => {
        return { ...x[0], owner: x[1] }
    })

    console.log(result)
    fs.writeFileSync(`./scripts/data/rewards_result.json`, JSON.stringify(result))

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

