const { ethers } = require('hardhat');
const AsyncConf = require('../utils/asyncConf');
const deployEnv = require('../loadEnv');
const DEBUG = require('debug')('forta:scanner-migration');

const CHUNK_SIZE = 50;
const MULTICALL_CHUNK_SIZE = 2;
const SCANNER_LIST_FILE_NAME = '';
const CHAIN_ID = 137; // Complete chain ids: 1, 10, 56, 137, 250, 42161, 43114

function getScannersFilePath(network) {
    return `../data/scanners/${network.name}/${SCANNER_LIST_FILE_NAME}`
};

function filterNonMigrations(scanners) {
    const result = {};
    for (const id of Object.keys(scanners)) {
        if (!scanners[id].migrated && !scanners[id].optingOut && !scanners[id].activeStakeBelowMin) {
            result[id] = scanners[id];
        }
    }
    return result;
}

/**
 * Takes an ethers.js transaction receipt, takes the migration events and updates the json file detailing the migration state, updating migrated and poolId
 * @param {*} cache AsyncConf pointing to migration json file
 * @param {*} receipt ethers.js tx receipt
 * @param {*} chainId of the monitored chain (must exist in json file)
 * @param {*} owner of the scanners/scannerPool (must exist in json file)
 * @param {*} scannerAddresses that were submitted to migration
 */
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
        await cache.set(`${chainId}.${owner}.scanner-registry.${updated}.migrated`, true);
    }
    console.log('Saved migration results for: ', receipt.transactionHash);
}

/**
 * This method will migrate the scanners from an owner and assign them to a Scanner Pool
 * It will filter out already migrated scanners (by json file), opted out scanners (by smart contract and json file),
 * and scanners whose active stake is too (by smart contract and json file) low for their chain id.
 * If the poolId is 0 (in the json file), it will mint a new pool.
 * This method will try to do 1 multicall transaction with all chunked migrate([scanners]) calls, plus 1 tx with an initial batch to mint the pool.
 * It will update the migrated scanners and minted pool id in the migration json file.
 * @param {*} cache AsyncConf pointing to migration json file
 * @param {*} registryMigration ethers contract attached to ScannerToScannerPoolMigration with deployer address with MIGRATION_EXECUTOR_ROLE
 * @param {*} owner of the scanners/scannerPool (must exist in json file)
 * @param {*} chainId monitored by scanners/scanner pool
 * @param {*} chunkSize max amount of scanners in each migrate call.
 * @param {*} callChunkSize max amount of migrate calls in each multicall.
 */
async function migratePool(cache, registryMigration, owner, chainId, chunkSize, callChunkSize) {
    if ((chunkSize ?? 0) <= 0 || (callChunkSize ?? 0) <= 0) {
        throw new Error('chunk sizes cannot be <=0 ');
    }
    let poolId = await cache.get(`${chainId}.${owner}.poolId`);
    let scanners = await cache.get(`${chainId}.${owner}.scanner-registry`);
    let scannerAddresses = Object.keys(scanners);
    DEBUG('poolId', poolId);
    DEBUG('raw: ', scannerAddresses.length);
    scanners = filterNonMigrations(scanners);
    scannerAddresses = Object.keys(scanners);
    DEBUG('filtered: ', scannerAddresses.length);

    if (Object.keys(scanners).length === 0) {
        console.log('All migrated for ', poolId);
        return;
    }
    let migratedAddresses = [];

    if (!poolId) {
        console.log('minting pool and migrating');
        migratedAddresses = Object.keys(scanners).slice(0, chunkSize);
        await migrateScannersMintPool(cache, registryMigration, owner, chainId, migratedAddresses);
        poolId = await cache.get(`${chainId}.${owner}.poolId`);
        console.log('poolId', poolId);
        DEBUG('migrated Addresses', migratedAddresses);
    }
    scannerAddresses = scannerAddresses.filter((id) => !migratedAddresses.includes(id));
    if (scannerAddresses.length === 0) {
        DEBUG('All migrated when minting');
        return;
    }
    console.log('Registering scanners in batch...');
    const calls = scannerAddresses.chunk(chunkSize).map((addressChunk) => registryMigration.interface.encodeFunctionData('migrate', [addressChunk, poolId, owner, chainId]));
    console.log('Batches: ', Math.ceil(calls.length / callChunkSize));

    await Promise.all(
        calls.chunk(callChunkSize).map(async (callChunk) => {
            let tx;
            try {
                tx = await registryMigration.multicall(callChunk, { gasPrice: 300000000000, gasLimit: 21000000 });
            } catch (e) {
                console.log('ERROR migratePool');
                console.log('chainId', chainId);
                console.log('poolId', poolId);
                throw new Error(e);
            }
            const receipt = await tx.wait();
            console.log('migrated: ', receipt.transactionHash);
            await saveMigration(cache, receipt, chainId, owner, scannerAddresses);
        })
    ).then(() => console.log('Pool migrated!'));
}

/**
 * Calls migrate on provided scannerAddresses minting a ScannerPoolRegistry NFT, recording the new id and migrated scanners in cache file.
 * @param {*} cache AsyncConf pointing to migration json file
 * @param {*} registryMigration ethers contract attached to ScannerToScannerPoolMigration with deployer address with MIGRATION_EXECUTOR_ROLE
 * @param {*} owner address owning the scanners, will own the scanner pool
 * @param {*} chainId monitored by scanners/scanner pool
 * @param {*} scannerAddresses array of scanner public keys
 */
async function migrateScannersMintPool(cache, registryMigration, owner, chainId, scannerAddresses) {
    DEBUG('...migrateScannersMintPool...');
    let receipt;
    try {
        const tx = await registryMigration.migrate(scannerAddresses, 0, owner, chainId, { gasPrice: 300000000000, gasLimit: 21000000 });
        receipt = await tx.wait();
    } catch (e) {
        console.log('migrateScannersMintPool');
        console.log('chainId', chainId);
        console.log('owner', owner);
        throw new Error(e);
    }
    await saveMigration(cache, receipt, chainId, owner, scannerAddresses);
}

/**
 * Main method to migrate all the scanner pools. It will filter out already migrated scanners (by json file) and opted out scanners (by smart contract and json file)
 * This method will try to do 1 multicall transaction with all chunked migrate([scanners]) calls.
 * @param {*} config object containing init values. If an expected value is not provided the script will try to load defaults.
 * - deployer ethers.js deployer with MIGRATION_EXECUTOR_ROLE. Default: provided by scripts/loadEnv according to hardhat network config used
 * - contracts object with initialized ethers.js Contract objects (only scannerToScannerPoolMigration used). Default: provided by scripts/loadEnv according to hardhat network config used
 * - network object with name and chainId. Default: provided by scripts/loadEnv according to hardhat network config used
 * - chunkSize amount of scanners in each migrate call. Default: CHUNK_SIZE
 * - callChunkSize amount of scanners in each migrate call. Default: CHUNK_SIZE
 * - scannersFilePath path to the migration json. Default: SCANNERS_FILE_PATH
 * - chainId (string) that the scanners monitor. It will select the scanners from the file under that chainId entry. Default: CHAIN_ID
 */
async function scanners2ScannerPools(config = {}) {
    let e;
    if (!config.deployer || !config.contracts || !config.network) {
        DEBUG('loading env');
        e = await deployEnv.loadEnv();
    }
    const migrationExecutor = config.deployer ?? e.deployer;
    const contracts = config.contracts ?? e.contracts;
    const network = config.network ?? e.network;
    const chunkSize = config.chunkSize ?? CHUNK_SIZE;
    const callChunkSize = config.callChunkSize ?? MULTICALL_CHUNK_SIZE;
    const scanersFilePath = config.scannersFilePath ?? getScannersFilePath(network);
    const chainId = config.chainId ?? CHAIN_ID;
    const cache = new AsyncConf({ cwd: __dirname, configName: scanersFilePath.replace('.json', '') });

    console.log(`Network`);
    console.log(network);
    console.log(`Migration Executor: ${migrationExecutor.address}`);
    console.log('--------------------- Scanner 2 ScannerPool -------------------------------');
    console.log('Chain ', chainId);
    const owners = Object.keys(await cache.get(chainId.toString()));
    for (const owner of owners) {
        console.log('Owner ', owner);
        await migratePool(cache, contracts.scannerToScannerPoolMigration.connect(migrationExecutor), owner, chainId, chunkSize, callChunkSize);
    }
    console.log('Done!');
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
module.exports.filterNonMigrations = filterNonMigrations;
