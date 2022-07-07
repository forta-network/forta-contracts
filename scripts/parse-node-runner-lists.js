const fs = require('fs');
const _ = require('lodash');

//const yesterdayNodes = require('./data/nodes-to-stake_1650914637350.json');
//const funnel = require('./data/funnel3.json');
let csvToJson = require('convert-csv-to-json');
const { ethers } = require('hardhat');
const utils = require('./utils');
const stakingUtils = require('./utils/staking');

const { CloudWatchLogsClient, StartQueryCommand, GetQueryResultsCommand } = require('@aws-sdk/client-cloudwatch-logs');

const exceptions = ['0xb7dfe9749085B4847B6405ADB348BE43cca3EAE5'];

function getKYCNodes() {
    let funnel = csvToJson.getJsonFromCsv('./scripts/data/funnel.csv');
    const nodes = funnel.map((x) => x['NODEaddress']).filter((x) => x.startsWith('0x'));

    const enables = nodes.reduce((prev, current) => {
        prev[current] = { kyc: true };
        return prev;
    }, {});
    return enables;
}

async function queryConnectedNodesNotStaked() {
    const REGION = 'us-east-1'; //e.g. "us-east-1"
    // Create an Amazon CloudWatch Logs service client object.
    const client = new CloudWatchLogsClient({ region: REGION });

    const endTime = new Date();
    const startTime = new Date();
    startTime.setTime(endTime.getTime() - 1 * 60 * 60 * 1000);

    const queryParams = {
        endTime: endTime.getTime(),
        limit: 10000,
        logGroupName: 'prod-alert-api',
        queryString: `fields scanner
    | filter msg = "unauthorized scanner"
    | stats count(*) by scanner`,
        startTime: startTime.getTime(),
    };
    const startQueryCommand = new StartQueryCommand(queryParams);
    const queryId = await client.send(startQueryCommand);

    return new Promise(function (resolve) {
        setTimeout(async () => {
            const getQueryResultsCommand = new GetQueryResultsCommand(queryId);
            const results = await client.send(getQueryResultsCommand);

            resolve(
                results.results
                    .flat()
                    .filter((x) => x.value.startsWith('0x'))
                    .map((x) => ethers.utils.getAddress(x.value))
            );
        }, 5000);
    });
}

async function main() {
    const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });

    console.log(`Network:  ${name} (${chainId})`);
    console.log(`Deployer: ${deployer.address}`);
    console.log('----------------------------------------------------');
    if (chainId !== 80001 && chainId !== 137) {
        throw new Error('Only supported for Polygon or Mumbai');
    }

    const contracts = {
        agents: await utils.attach('AgentRegistry', await CACHE.get('agents.address')).then((contract) => contract.connect(deployer)),
        scanners: await utils.attach('ScannerRegistry', await CACHE.get('scanners.address')).then((contract) => contract.connect(deployer)),
        staking: await utils.attach('FortaStaking', await CACHE.get('staking.address')).then((contract) => contract.connect(deployer)),
    };
    const kycNodes = getKYCNodes();

    console.log('# kycNodes: ', Object.keys(kycNodes).length);

    const connectedNodes = await queryConnectedNodesNotStaked();
    console.log('# connectedNodes: ', connectedNodes.length);
    const connectedKYCd = connectedNodes.filter((id) => {
        return kycNodes[id]?.kyc;
    });
    console.log('# connectedKYCd: ', connectedKYCd.length);

    const data = connectedKYCd
        .map((registryId) => {
            return { registryId: registryId, activeShareId: stakingUtils.subjectToActive(0, registryId) };
        })
        .map((item) => {
            return {
                registryId: item.registryId,
                activeShareId: item.activeShareId.toString(),
                call: contracts.staking.interface.encodeFunctionData('activeStakeFor', [0, item.registryId]),
            };
        });
    const idChunks = [];
    const stake = await Promise.all(
        data
            .map((x) => [x.registryId, x.activeShareId, x.call])
            .chunk(20)
            .map((chunk) => {
                idChunks.push(chunk.map((x) => x[0]));
                const calls = chunk.map((x) => x[2]);
                return contracts.staking.callStatic.multicall(calls);
            })
    );
    const idsAndStakes = _.zip(idChunks.flat(), stake.flat());
    console.log('# ids and stakes', idsAndStakes.length);

    const connectedKYCdNotStaked = idsAndStakes
        .filter((x) => {
            return ethers.BigNumber.from(x[1]).eq(ethers.BigNumber.from(0));
        })
        .filter((x) => {
            console.log(!exceptions.includes(x[0]));
            return !exceptions.includes(x[0]);
        })
        .map((x) => x[0]);

    console.log('# connectedKYCdNotStaked: ', connectedKYCdNotStaked.length);

    const result = JSON.stringify({ amount: connectedKYCdNotStaked.length, result: connectedKYCdNotStaked, connectedAndFailing: connectedNodes });

    fs.writeFileSync(`./scripts/data/connected-kyc.json`, result);
    console.log('Set!');
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
