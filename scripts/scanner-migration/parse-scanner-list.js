const { ethers } = require('hardhat');
const utils = require('../utils');
const deployEnv = require('../loadEnv');
const fs = require('fs');
let csvToJson = require('convert-csv-to-json');

async function main() {
    const { deployer, network, contracts } = await deployEnv.loadEnv();
    console.log(`Network:  ${network.name} ${network.chainId}`);
    console.log(`Deployer: ${deployer.address}`);
    console.log('----------------------------------------------------');
    let raw = csvToJson
        .fieldDelimiter(',')
        .getJsonFromCsv(`./scripts/data/scanners/${network.name}/On_demand_report_2022-11-24T16_27_13.841Z_da721a10-6c14-11ed-aa40-81c129ba7807.csv`)
        .slice(0, 1000);

    raw = await Promise.all(
        raw.map(async (scanner) => {
            return {
                id: scanner['_source.id'],
                chainId: scanner['_source.chain_id'],
                enabled: scanner['_source.enabled'] === 'true',
                callOwner: contracts.scanners.interface.encodeFunctionData('ownerOf', [scanner['_source.id']]),
                migrated: false,
            };
        })
    );

    let owners = await Promise.all(
        raw.chunk(50).map((chunk) => {
            const calls = chunk.map((x) => x.callOwner);
            return contracts.scanners.callStatic.multicall(calls);
        })
    );
    owners = owners.flat();

    for (let i = 0; i < owners.length; i++) {
        raw[i].owner = `0x${owners[i].slice(-40)}`;
    }

    const grouped = {};

    for (const scanner of raw) {
        if (!grouped[scanner.chainId]) {
            grouped[scanner.chainId] = {};
        }
        if (!grouped[scanner.chainId][scanner.owner]) {
            grouped[scanner.chainId][scanner.owner] = {
                scanners: {},
                poolId: 0,
            };
        }
        grouped[scanner.chainId][scanner.owner].scanners[scanner.id] = scanner;
    }

    fs.writeFileSync(`./scripts/data/scanners/${network.name}/scanners.json`, JSON.stringify(grouped), null, 2);
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
