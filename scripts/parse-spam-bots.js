const fs = require('fs');
let csvToJson = require('convert-csv-to-json');
const _ = require('lodash');
const utils = require('./utils');
const { BigNumber } = require('@ethersproject/bignumber');
const { ethers } = require('ethers');

function getSpamBots() {
    const bots = csvToJson.fieldDelimiter(',').getJsonFromCsv('./scripts/data/May 2022 Spam bots - 5_2_22 dup image bots _ 3.csv');
    bots.push(...csvToJson.fieldDelimiter(',').getJsonFromCsv('./scripts/data/May 2022 Spam bots - 5_13_22 spam bots.csv'));
    return bots;
}

async function main() {
    const result = getSpamBots();
    const botIds = result.map((x) => x.agent_id);
    const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

    const { chainId } = await provider.getNetwork();
    console.log('botsIds:', botIds.length);
    let configName;
    if (chainId === 5) {
        configName = chainId === 5 ? './_old/.cache-5-with-components' : `.cache-${chainId}`;
    } else {
        configName = `.cache-${chainId}`;
    }
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: configName });

    const contracts = await Promise.all(
        Object.entries({
            agents: utils.attach('AgentRegistry', await CACHE.get('agents.address')).then((contract) => contract.connect(deployer)),
        }).map((entry) => Promise.all(entry))
    ).then(Object.fromEntries);

    const enabledResults = await Promise.all(
        botIds
            .map((x) => [x, contracts.agents.interface.encodeFunctionData('isEnabled', [x])])
            .chunk(100)
            .map((chunk) => {
                const calls = chunk.map((x) => x[1]);
                return contracts.agents.callStatic.multicall(calls);
            })
    );
    const idsAndState = _.zip(botIds, enabledResults.flat());

    const enabledSpamBots = idsAndState.filter((x) => !BigNumber.from(x[1]).eq(ethers.constants.Zero)).map((x) => x[0]);
    console.log('enabledSpamBots', enabledSpamBots.length);
    fs.writeFileSync(`./scripts/data/spam_bots.json`, JSON.stringify(enabledSpamBots));
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
