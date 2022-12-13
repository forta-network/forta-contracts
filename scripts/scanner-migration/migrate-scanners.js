const { ethers } = require('hardhat');
const utils = require('../utils');
const deployEnv = require('../loadEnv');
const scannerData = require('../data/scanners/matic/scanners.json');

const CHUNK_SIZE = 100;

function filterMigrated(scanners) {
    const result = {};
    for (const id of Object.keys(scanners)) {
        if (!scanners[id].migrated) {
            result[id] = scanners[id];
        }
    }
    return result;
}

function sliceScanners(scanners, from, to) {
    const result = {};
    for (const id of Object.keys(scanners).slice(from, to)) {
        result[id] = scanners[id];
    }
    return result;
}

async function saveMigration(cache, receipt, chainId, owner, scannerAddresses) {
    const mintedEvent = receipt.events.find((x) => x.event === 'MigrationExecuted');
    if (mintedEvent?.args.mintedScannerPool) {
        const poolId = mintedEvent?.args.scannerPoolId?.toString();
        await cache.set(`${chainId}.${owner}.poolId`, poolId);
    }
    const scannerUpdatedTopic = ethers.utils.id('ScannerUpdated(uint256,uint256,string,uint256)');
    const scannerRegistrationEvents = receipt.events.filter((x) => x.topics[0] === scannerUpdatedTopic);
    let updatedAddresses = scannerAddresses.filter((id) => scannerRegistrationEvents.find((event) => event.topics[1].includes(id.toLowerCase().replace('0x', ''))));
    for (const updated of updatedAddresses) {
        await cache.set(`${chainId}.${owner}.scanners.${updated}.migrated`, true);
    }
}

async function migratePool(cache, registryMigration, owner, chainId, chunkSize) {
    let poolId = await cache.set(`${chainId}.${owner}.poolId`);
    let scanners = await cache.set(`${chainId}.${owner}.scanners`);
    scanners = filterMigrated(scanners);
    let migratedAddresses = [];
    if (poolId === '0') {
        const firstScanners = sliceScanners(0, chunkSize);
        await migrateScannersMintPool(cache, registryMigration, owner, chainId, firstScanners);
        poolId = await cache.set(`${chainId}.${owner}.poolId`);
        migratedAddresses = Object.keys(firstScanners);
    }
    let scannerAddressesChunks = Object.keys(scanners)
        .filter((id) => !migratedAddresses.includes(id))
        .chunk(chunkSize);

    const calls = scannerAddressesChunks.map((addressChunk) => registryMigration.interface.encodeFunctionData('migrate', [addressChunk, poolId, owner, chainId]));
    const tx = await registryMigration.multicall(calls);
    const receipt = await tx.wait();
    saveMigration(cache, receipt, chainId, owner, scannerAddressesChunks.flat());
}

async function migrateScannersMintPool(cache, registryMigration, owner, chainId, scanners) {
    const scannerAddresses = Object.keys(scanners);
    const tx = await registryMigration.migrate(scannerAddresses, 0, owner, chainId);
    const receipt = await tx.wait();
    await saveMigration(cache, receipt, chainId, owner, scannerAddresses);
}

async function scanner2ScannerPool(config = {}) {
    let e;
    if (!config.deployer || !config.contracts || !config.network) {
        e = await deployEnv.loadEnv();
    }
    const deployer = config.deployer ?? e.deployer;
    const contracts = config.contracts ?? e.contracts;
    const network = config.network ?? e.network;
    const chunkSize = config.chunkSize ?? CHUNK_SIZE;
    updateScannerData(scannerData, network);
    console.log(`Deployer: ${deployer.address}`);
    console.log('--------------------- Scanner 2 ScannerPool -------------------------------');
    const chains = Object.keys(scannerData);
    for (const chain of chains) {
        console.log('Chain ', chain);
        const owners = Object.keys(scannerData[chains]);
        for (const owner of owners) {
            console.log('Owner ', owner);
            const scanners = owners[owner].scanner.filter((s) => !s.migrated);
            let poolId = owners[owner].poolId;
            const migrations = migratePool(scanners, chunkSize, contracts);
        }
    }
}

if (require.main === module) {
    scanner2ScannerPool()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports.scanner2ScannerPool = scanner2ScannerPool;
module.exports.migrateScannersMintPool = migrateScannersMintPool;
