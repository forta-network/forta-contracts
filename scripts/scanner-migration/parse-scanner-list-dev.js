const deployEnv = require('../loadEnv');
const fs = require('fs');
const { readFileSync } = require('fs');

const FILE_NAME = 'dev-scanners.json';

/**
 * Script to format an JSON of the dev scanners to a migration file
 */
async function main() {
    const { deployer, network, contracts, deployment } = await deployEnv.loadEnv();
    console.log(`Network:  ${network.name} ${network.chainId}`);
    console.log(`Deployer: ${deployer.address}`);
    console.log('----------------------------------------------------');
    let raw = JSON.parse(readFileSync(`./scripts/data/scanners/mumbai/${FILE_NAME}`).toString());

    console.log(`contracts.scannerRegistry: ${JSON.stringify(contracts.scannerRegistry)}}`);

    raw = await Promise.all(
        Object.values(raw).map(async (scanner) => {
            return {
                id: scanner['id'],
                chainId: scanner['chainId'],
                enabled: scanner['enabled'] === 'true',
                callOwner: contracts.scannerRegistry.interface.encodeFunctionData('ownerOf', [scanner['id']]),
                callOptingOut: contracts.scannerRegistry.interface.encodeFunctionData('optingOutOfMigration', [scanner['id']]), // Error: no matching function (argument="name", value="optingOutOfMigration")
                callActiveStake: contracts.fortaStaking.interface.encodeFunctionData('activeStakeFor', [0, scanner['id']]),
                // callMinStakeFor: contracts.fortaStaking.interface.encodeFunctionData('subjectGateway.minStakeFor', [0, scanner['id']]), // Error: no matching function (argument="name", value="subjectGateway.minStakeFor")
                migrated: false,
                optingOut: false,
                activeStakeBelowMin: false,
            };
        })
    );

    console.log(`raw after parsing: ${JSON.stringify(raw)}`);

    /*
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
    console.log('Getting activeStakeBelowMin...');
    if (deployment.fortaStaking.impl.version === '0.1.1') {
        let activeStakes = await Promise.all(
            raw.chunk(50).map((chunk) => {
                const calls = chunk.map((x) => x.callActiveStake);
                return contracts.fortaStaking.callStatic.multicall(calls);
            })
        );
        let minStakeFor = await Promise.all(
            raw.chunk(50).map((chunk) => {
                const calls = chunk.map((x) => x.callMinStakeFor);
                return contracts.fortaStaking.callStatic.multicall(calls);
            })
        );
        minStakeFor = minStakeFor.flat();
        activeStakes = activeStakes.flat();
        for (let i = 0; i < activeStakes.length; i++) {
            if(activeStakes[i] < minStakeFor[i]) {
                raw[i].activeStakeBelowMin = true;
            }
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
    */
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