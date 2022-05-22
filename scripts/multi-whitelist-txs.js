const { ethers } = require('hardhat');
const _ = require('lodash');
const utils = require('./utils');
const DEBUG = require('debug')('forta');

const rewardables = require('./data/rewards_week3_result.json');

const FORTA_TOKEN_NAME = {
    1: 'Forta',
    4: 'Forta',
    5: 'Forta',
    80001: 'FortaBridgedPolygon',
    137: 'FortaBridgedPolygon',
};

async function whitelist(config = {}) {
    const provider = config.provider ?? (await utils.getDefaultProvider());
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    let configName;
    if (chainId === 5) {
        configName = chainId === 5 ? './_old/.cache-5-with-components' : `.cache-${chainId}`;
    } else {
        configName = `.cache-${chainId}`;
    }
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: configName });

    const contracts =
        config.contracts ??
        (await Promise.all(
            Object.entries({
                forta: utils.attach(FORTA_TOKEN_NAME[chainId], await CACHE.get('forta.address')).then((contract) => contract.connect(deployer)),
                relayer: utils.attach('BatchRelayer', await CACHE.get('batch-relayer.address')).then((contract) => contract.connect(deployer)),
            }).map((entry) => Promise.all(entry))
        ).then(Object.fromEntries));

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`Deployer: ${deployer.address}`);

    DEBUG('----------------------------------------------------');

    console.log('Rewardables:', rewardables.length);

    const WHITELIST_ROLE = ethers.utils.id('WHITELIST_ROLE');

    const owners = [];
    const whitelisted = await Promise.all(
        rewardables.chunk(59).map(async (chunk) => {
            owners.push(chunk.map((x) => x.owner));
            return await Promise.all(chunk.map((x) => contracts.forta.hasRole(WHITELIST_ROLE, x.owner)));
        })
    );
    const notWhitelisted = _.zip(whitelisted.flat(), owners.flat())
        .filter((x) => !x[0])
        .map((x) => x[1]);

    console.log('Not whitelisted:', notWhitelisted.length);

    const calldatas = notWhitelisted.map((x) => contracts.forta.interface.encodeFunctionData('grantRole', [WHITELIST_ROLE, x]));

    const receipts = await Promise.all(
        calldatas.chunk(50).map((chunk) => {
            return contracts.relayer.relay(contracts.forta.address, chunk).then((tx) => tx.wait());
        })
    );
    console.log(receipts);
}

whitelist()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
