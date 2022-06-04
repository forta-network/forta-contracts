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
    let funnel = csvToJson.fieldDelimiter(',').getJsonFromCsv('./scripts/data/rewards_week4.csv');
    const nodes = funnel
        .map((x) => {
            return {
                scanner: ethers.utils.getAddress(x['scanner']),
                amount: parseEther(x['fortAmount']),
                shares: parseEther(x['sharesAmount']),
            };
        })
        .filter((x) => x.amount.gt(BigNumber.from('0')))
        .map((x) => {
            return {
                ...x,
                amount: x.amount.toString(),
                shares: x.shares.toString(),
                status: 'NOT_SENT',
                epoch: 'epoch_4',
                mode: 'TRANSFER_OWNER',
            };
        });

    return nodes;
}

function getRepeated() {
    let funnel = csvToJson.fieldDelimiter(',').getJsonFromCsv('./scripts/data/repeated_week3.csv');
    const nodes = funnel.map((x) => {
        console.log(x)
        return {
            owner: x.owner.toLowerCase(),
            amount: parseEther(x['fort']).toString(),
            tokenId: x.TokenID.startsWith('https://') ? 'multiple' : x.TokenID,
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
            activeShareId: stakingUtils.subjectToActive(0, item.scanner).toString(),
            tokenId: ethers.BigNumber.from(item.scanner).toString(),
            callOwner: contracts.scanners.interface.encodeFunctionData('ownerOf', [ethers.utils.getAddress(item.scanner)]),
        };
    });
    const repeated = getRepeated();
    console.log(repeated)
    /*
    const items = [];
    const owners = await Promise.all(
        data.chunk(10).map((chunk, index) => {
            console.log(index);
            console.log(chunk);
            items.push(chunk);
            if (index < 99) {
                const calls = chunk.map((x) => x.callOwner);
                return contracts.scanners.callStatic.multicall(calls);
            } else {
                return Promise.resolve(chunk.map(() => '0xlol'));
            }
        })
    );
    const result = _.zip(
        items.flat(),
        owners.flat().map((x) => ethers.utils.hexDataSlice(x, 12))
    )
        .map((x) => {
            return { ...x[0], owner: ethers.utils.getAddress(x[1]) };
        })
        .map((x) => {
            return {
                ...x,
                owner: x.owner.toLowerCase(),
                scanner: x.scanner.toLowerCase(),
            };
        });
        */
    // console.log(result)
    //fs.writeFileSync(`./scripts/data/rewards_week4_result.json`, JSON.stringify(result));
    /*const fortToSend = result.map((x) => BigNumber.from(x.amount)).reduce((prev, curr) => prev.add(curr), BigNumber.from('0'));
    console.log('rewardables', result.length);
    console.log('fortToSend', ethers.utils.formatEther(fortToSend));*/
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
