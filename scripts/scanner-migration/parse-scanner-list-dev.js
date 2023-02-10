const deployEnv = require('../loadEnv');
const fs = require('fs');
const { readFileSync } = require('fs');
const { BigNumber } = require(`ethers`);

const FILE_NAME = 'dev-scanners.json';

/**
 * Script to format an JSON of the dev scanners to a migration file
 */
async function main() {
    const { deployer, network, contracts, deployment } = await deployEnv.loadEnv();
    console.log(`Network:  ${network.name} ${network.chainId}`);
    console.log(`Deployer: ${deployer.address}`);
    console.log('----------------------------------------------------');
    let raw = JSON.parse(readFileSync(`./scripts/data/scanners/${network.name}/${FILE_NAME}`).toString());

    raw = await Promise.all(
        Object.values(raw).map(async (scanner) => {
            return {
                id: scanner['id'],
                chainId: scanner['chainId'],
                enabled: scanner['enabled'] === 'true',
                callOwner: contracts.scannerRegistry.interface.encodeFunctionData('ownerOf', [scanner['id']]),
                callOptingOut: contracts.scannerRegistry.interface.encodeFunctionData('optingOutOfMigration', [scanner['id']]),
                callActiveStake: contracts.fortaStaking.interface.encodeFunctionData('activeStakeFor', [0, scanner['id']]),
                callGetStakeThreshold: contracts.scannerRegistry.interface.encodeFunctionData('getStakeThreshold', [scanner['id']]),
                migrated: false,
                optingOut: false,
                activeStakeBelowMin: false,
            };
        })
    );
    console.log('Getting owners...');
    let owners = await Promise.all(
        raw.chunk(50).map((chunk) => {
            const calls = chunk.map((x) => x.callOwner);
            return contracts.scannerRegistry.callStatic.multicall(calls);
        })
    );
    owners = owners.flat();

    for (let i = 0; i < owners.length; i++) {
        raw[i].owner = `0x${owners[i].slice(-40)}`;
    }
    console.log('Getting optingOuts...');
    if (deployment["scanner-registry"].impl.version === '0.1.4') {
        let optingOuts = await Promise.all(
            raw.chunk(50).map((chunk) => {
                const calls = chunk.map((x) => x.callOptingOut);
                return contracts.scannerRegistry.callStatic.multicall(calls);
            })
        );

        optingOuts = optingOuts.flat();
        for (let i = 0; i < optingOuts.length; i++) {
            const decodedData = contracts.scannerRegistry.interface.decodeFunctionResult('optingOutOfMigration', optingOuts[i]);
            raw[i].optingOut = decodedData[0];
        }
    }

    console.log('Getting activeStakeBelowMin...');
    if (deployment["forta-staking"].impl.version === '0.1.2') {
        let activeStakes = await Promise.all(
            raw.chunk(50).map((chunk) => {
                const calls = chunk.map((x) => x.callActiveStake);
                return contracts.fortaStaking.callStatic.multicall(calls);
            })
        );
        let minStakeThreshold = await Promise.all(
            raw.chunk(50).map((chunk) => {
                const calls = chunk.map((x) => x.callGetStakeThreshold);
                return contracts.scannerRegistry.callStatic.multicall(calls);
            })
        );
        minStakeThreshold = minStakeThreshold.flat();
        activeStakes = activeStakes.flat();
        for (let i = 0; i < activeStakes.length; i++) {
            const decodedActiveStake = contracts.fortaStaking.interface.decodeFunctionResult('activeStakeFor', activeStakes[i]);
            const decodedMinStakeThreshold = (contracts.scannerRegistry.interface.decodeFunctionResult('getStakeThreshold', minStakeThreshold[i]))[0][0];

            const bnActiveStake = BigNumber.from(decodedActiveStake.toString());
            const bnMinStakeThreshold = BigNumber.from(decodedMinStakeThreshold.toString());

            raw[i].activeStake = decodedActiveStake.toString();
            raw[i].minStakeThreshold = decodedMinStakeThreshold.toString();
            if(bnActiveStake.lt(bnMinStakeThreshold)) {
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
                "scanner-registry": {},
                poolId: 0,
            };
        }
        grouped[scanner.chainId][scanner.owner]["scanner-registry"][scanner.id] = scanner;
    }
    console.log(`networkName: ${network.name}`);
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