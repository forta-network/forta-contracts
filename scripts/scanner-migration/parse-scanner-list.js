const deployEnv = require('../loadEnv');
const fs = require('fs');
let csvToJson = require('convert-csv-to-json');

const FILE_NAME = 'On_demand_report_2022-11-24T16_27_13.841Z_da721a10-6c14-11ed-aa40-81c129ba7807.csv';

/**
 * Script to format an AWS Export of the scanners to a migration file
 */
async function main() {
    const { deployer, network, contracts, deployment } = await deployEnv.loadEnv();
    console.log(`Network:  ${network.name} ${network.chainId}`);
    console.log(`Deployer: ${deployer.address}`);
    console.log('----------------------------------------------------');
    let raw = csvToJson.fieldDelimiter(',').getJsonFromCsv(`./scripts/data/scanners/${network.name}/${FILE_NAME}`).slice(0, 1000);

    raw = await Promise.all(
        raw.map(async (scanner) => {
            return {
                id: scanner['_source.id'],
                chainId: scanner['_source.chain_id'],
                enabled: scanner['_source.enabled'] === 'true',
                callOwner: contracts.scanners.interface.encodeFunctionData('ownerOf', [scanner['_source.id']]),
                callOptingOut: contracts.scanners.interface.encodeFunctionData('optingOutOfMigration', [scanner['_source.id']]),
                migrated: false,
                optingOut: false,
            };
        })
    );
    console.log('Getting owners...');
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
    console.log('Getting optingOuts...');
    if (deployment.scanners.impl.version === '0.1.4') {
        let optingOuts = await Promise.all(
            raw.chunk(50).map((chunk) => {
                const calls = chunk.map((x) => x.callOptingOut);
                return contracts.scanners.callStatic.multicall(calls);
            })
        );

        optingOuts = optingOuts.flat();
        for (let i = 0; i < optingOuts.length; i++) {
            raw[i].optingOut = optingOuts[i];
        }
    }
    console.log('Formatting...');

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
    const outputPath = `./scripts/data/scanners/${network.name}/scanners_${+Date.now()}.json`;
    fs.writeFileSync(outputPath, JSON.stringify(grouped), null, 2);
    console.log('Saved!');
    console.log(outputPath);
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
