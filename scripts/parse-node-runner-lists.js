const fs = require('fs');
//const yesterdayNodes = require('./data/nodes-to-stake_1650914637350.json');
//const funnel = require('./data/funnel3.json');
let csvToJson = require('convert-csv-to-json');
const { ethers } = require('hardhat');
const DEBUG                = require('debug')('forta:set-staking-threshold');
const utils                = require('./utils');

const SCANNER_SUBJECT = 0;
const AGENT_SUBJECT = 1;

const { CloudWatchLogsClient, StartQueryCommand, GetQueryResultsCommand } = require( "@aws-sdk/client-cloudwatch-logs");


function getKYCNodes() {
    let funnel = csvToJson.getJsonFromCsv("./scripts/data/funnel.csv");
    console.log(funnel)
    const nodes = funnel.map(x => x['NODEaddress']).filter(x => x.startsWith('0x'));
    console.log(nodes)
    const enables = nodes.reduce((prev, current) => { prev[current] = { kyc: true}; return prev }, {})
    return enables
}


// Set the AWS Region.

/*


const b = new Set(yesterdayNodes);
const difference = nodes.filter(x => !b.has(x))


const result = {
    'all-nodes-to-date': nodes,
    'last-batch': yesterdayNodes,
    'new-nodes': difference
}

console.log('# of nodes:', nodes.length);
console.log('# of yesterda:', yesterdayNodes.length);
console.log('# new owns:', difference.length);
*/
//fs.writeFileSync(`./scripts/data/nodes-to-stake_difference_${Date.now()}.json`, JSON.stringify(result))

async function queryConnectedNodesNotStaked() {
    const REGION = "us-east-1" //e.g. "us-east-1"
    // Create an Amazon CloudWatch Logs service client object.
    const client = new CloudWatchLogsClient({ region: REGION })

    const endTime = new Date() 
    const startTime = new Date()
    startTime.setTime(endTime.getTime() - (1 * 60 * 60 * 1000)) 

    const queryParams = {
        "endTime": endTime.getTime(),
        "limit": 10000,
        "logGroupName": "prod-alert-api",
        "queryString": `fields scanner
    | filter msg = "unauthorized scanner"
    | stats count(*) by scanner`,
        "startTime": startTime.getTime()
    }
    const startQueryCommand = new StartQueryCommand(queryParams);
    const queryId = await client.send(startQueryCommand);
    console.log(queryId)

    return new Promise(function(resolve, reject){

        setTimeout(async () => {
            const getQueryResultsCommand = new GetQueryResultsCommand({ queryId: '84d6c1dc-6be2-40c3-8637-36c1581680d9'});
            const results = await client.send(getQueryResultsCommand);

            resolve(results.results.flat().filter(x => x.value.startsWith('0x')).map(x => ethers.utils.getAddress(x.value)));
        }, 5000)
    });


}





async function main() {
    /*const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });

    console.log(`Network:  ${name} (${chainId})`);
    console.log(`Deployer: ${deployer.address}`);
    console.log('----------------------------------------------------');
    if (chainId !== 80001 && chainId !== 137) {
        throw new Error('Only supported for Polygon or Mumbai');
    }

    const contracts =  {
        agents: await (utils.attach('AgentRegistry',  await CACHE.get('agents.address')  ).then(contract => contract.connect(deployer))),
        scanners: await (utils.attach('ScannerRegistry', await CACHE.get('scanners.address')  ).then(contract => contract.connect(deployer))),
    }*/
    const connectedNodes = await queryConnectedNodesNotStaked()
    const kycNodes = getKYCNodes()
    console.log(kycNodes)
    const connectedKYCd = connectedNodes.filter(id => {
        console.log(id)
        console.log(kycNodes[id]?.kyc)
        return kycNodes[id]?.kyc
    })
    fs.writeFileSync(`./scripts/data/connected-kyc.json`, JSON.stringify(connectedKYCd))
    console.log('Set!');
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