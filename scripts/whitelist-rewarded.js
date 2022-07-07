const _ = require('lodash');

const { ethers } = require('hardhat');
const DEBUG = require('debug')('forta');
const utils = require('./utils');
const rewardables = require('./data/rewards_result.json');

const FORTA_TOKEN_NAME = {
    1: 'Forta',
    5: 'Forta',
    80001: 'FortaBridgedPolygon',
    137: 'FortaBridgedPolygon',
};

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

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`Deployer: ${deployer.address}`);

    DEBUG('----------------------------------------------------');
    const contracts =
        config.contracts ??
        (await Promise.all(
            Object.entries({
                forta: utils.attach(FORTA_TOKEN_NAME[chainId], await CACHE.get('forta.address')).then((contract) => contract.connect(deployer)),
            }).map((entry) => Promise.all(entry))
        ).then(Object.fromEntries));

    const WHITELIST_ROLE = ethers.utils.id('WHITELIST_ROLE');
    console.log('Rewardables:', rewardables.length);

    const owners = [];
    const whitelisted = await Promise.all(
        rewardables.chunk(1).map(async (chunk) => {
            owners.push(chunk.map((x) => x.owner));
            return await Promise.all(chunk.map((x) => contracts.forta.hasRole(WHITELIST_ROLE, x.owner)));
        })
    );
    const notWhitelisted = _.zip(whitelisted.flat(), owners.flat())
        .filter((x) => !x[0])
        .map((x) => x[1]);

    console.log('Not whitelisted:', notWhitelisted.length);

    const whitelistPromises = notWhitelisted.map((x) => contracts.forta.grantRole(WHITELIST_ROLE, x));

    const results = await Promise.all(
        whitelistPromises.chunk(50).map(async (chunk) => {
            return await Promise.all(chunk);
        })
    );
    console.log(results);
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
