const { ethers } = require('hardhat');
const utils = require('../utils');
const AsyncConf = utils.AsyncConf;
const deployEnv = require('../loadEnv');
const DEBUG = require('debug')('forta:scanner-migration');

const CHUNK_SIZE = 100;
const SCANNERS_FILE_PATH = '';
const CACHE_FILE_PATH = '';
const CHAIN_ID = 137;

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
    DEBUG('save-migration');
    const mintedEvent = receipt.events.find((x) => x.event === 'MigrationExecuted');
    if (mintedEvent?.args.mintedScannerPool) {
        const poolId = mintedEvent?.args.scannerPoolId?.toString();
        DEBUG('minted new pool Id', poolId);
        await cache.set(`${chainId}.${owner}.poolId`, poolId);
    } else {
        DEBUG('did not mint new pool');
    }
    const scannerUpdatedTopic = ethers.utils.id('ScannerUpdated(uint256,uint256,string,uint256)');
    const scannerRegistrationEvents = receipt.events.filter((x) => x.topics[0] === scannerUpdatedTopic);
    let updatedAddresses = scannerAddresses.filter((id) => scannerRegistrationEvents.find((event) => event.topics[1].includes(id.toLowerCase().replace('0x', ''))));
    DEBUG('Updated addresses');
    DEBUG(updatedAddresses.length);
    for (const updated of updatedAddresses) {
        DEBUG(chainId, owner, updated);
        await cache.set(`${chainId}.${owner}.scanners.${updated}.migrated`, true);
    }
}

async function migratePool(cache, registryMigration, owner, chainId, chunkSize) {
    let poolId = await cache.get(`${chainId}.${owner}.poolId`);
    let scanners = await cache.get(`${chainId}.${owner}.scanners`);
    DEBUG('poolId', poolId);
    scanners = filterMigrated(scanners);
    if (Object.keys(scanners).length === 0) {
        console.log('All migrated for ', poolId);
        return;
    }
    let migratedAddresses = [];
    if (poolId === 0) {
        DEBUG('minting pool and migrating');
        const firstScanners = sliceScanners(scanners, 0, chunkSize);
        await migrateScannersMintPool(cache, registryMigration, owner, chainId, firstScanners);
        poolId = await cache.get(`${chainId}.${owner}.poolId`);
        migratedAddresses = Object.keys(firstScanners);
        DEBUG('poolId', poolId);
        DEBUG('migrated Addresses', migratedAddresses.length);
    }
    DEBUG('Registering scanners in batch');
    let scannerAddressesChunks = Object.keys(scanners)
        .filter((id) => !migratedAddresses.includes(id))
        .chunk(chunkSize);

    const calls = scannerAddressesChunks.map((addressChunk) => registryMigration.interface.encodeFunctionData('migrate', [addressChunk, poolId, owner, chainId]));
    let tx;
    try {
        tx = await registryMigration.multicall(calls);
    } catch (e) {
        console.log('ERROR migratePool');
        console.log('chainId', chainId);
        console.log('poolId', poolId);
        throw new Error(e);
    }
    const receipt = await tx.wait();

    await saveMigration(cache, receipt, chainId, owner, scannerAddressesChunks.flat());
}

async function migrateScannersMintPool(cache, registryMigration, owner, chainId, scanners) {
    const scannerAddresses = Object.keys(scanners);
    let receipt;
    try {
        const tx = await registryMigration.migrate(scannerAddresses, 0, owner, chainId);
        receipt = await tx.wait();
    } catch (e) {
        console.log('migrateScannersMintPool');
        console.log('chainId', chainId);
        console.log('owner', owner);
        throw new Error(e);
    }
    await saveMigration(cache, receipt, chainId, owner, scannerAddresses);
}

async function scanners2ScannerPools(config = {}) {
    let e;
    if (!config.deployer || !config.contracts || !config.network) {
        DEBUG('loading env');
        e = await deployEnv.loadEnv();
    }
    const deployer = config.deployer ?? e.deployer;
    const contracts = config.contracts ?? e.contracts;
    const network = config.network ?? e.network;
    const chunkSize = config.chunkSize ?? CHUNK_SIZE;
    const scanersFilePath = config.scannersFilePath ?? SCANNERS_FILE_PATH;
    const chainId = config.chainId ?? CHAIN_ID;
    const cache = new AsyncConf({ cwd: __dirname, configName: scanersFilePath.replace('.json', '') });

    const scannerData = require(scanersFilePath);
    console.log(scannerData);
    console.log(`Network`);
    console.log(network);
    console.log(`Deployer: ${deployer.address}`);
    console.log('--------------------- Scanner 2 ScannerPool -------------------------------');
    console.log('Chain ', chainId);
    const owners = Object.keys(scannerData[chainId]);
    for (const owner of owners) {
        console.log('Owner ', owner);
        await migratePool(cache, contracts.registryMigration.connect(deployer), owner, chainId, chunkSize);
    }
}

if (require.main === module) {
    scanners2ScannerPools()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports.scanner2ScannerPool = scanners2ScannerPools;
module.exports.migrateScannersMintPool = migrateScannersMintPool;
module.exports.migratePool = migratePool;
module.exports.saveMigration = saveMigration;
