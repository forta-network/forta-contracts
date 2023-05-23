const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('./fixture');
const AsyncConf = require('../../scripts/utils/asyncConf');
const { subjectToActive } = require('../../scripts/utils/staking.js');
const { migrateScannersMintPool, migratePool, scanner2ScannerPool, filterNonMigrations } = require('../../scripts/scanner-migration/migrate-scanners');
const fs = require('fs');

const MIN_STAKE_MANAGED = '100';
const MAX_STAKE_MANAGED = '100000';

async function upgrade(contracts) {
    console.log('upgrading');
    const ScannerRegistry = await ethers.getContractFactory('ScannerRegistry');
    contracts.scanners = await upgrades.upgradeProxy(contracts.scanners.address, ScannerRegistry, {
        constructorArgs: [contracts.forwarder.address],
        unsafeAllow: ['delegatecall'],
        unsafeSkipStorageCheck: true,
    });

    const FortaStaking = await ethers.getContractFactory('FortaStaking');
    contracts.staking = await upgrades.upgradeProxy(contracts.staking.address, FortaStaking, {
        constructorArgs: [contracts.forwarder.address],
        unsafeAllow: ['delegatecall'],
    });
    await contracts.staking.configureStakeHelpers(contracts.subjectGateway.address, contracts.stakeAllocator.address);
    const sunsettingTime = 10000 + (await ethers.provider.getBlock('latest')).timestamp;
    await contracts.scanners.configureMigration(sunsettingTime, contracts.scannerPools.address);
    // Increase time to after migration
    await ethers.provider.send('evm_setNextBlockTimestamp', [sunsettingTime + 1]);
    await ethers.provider.send('evm_mine');
}

async function prepareScanners(contracts, scanners, staker, manager) {
    const scannerList = Object.keys(scanners).map((id) => scanners[id]);
    for (const scanner of scannerList) {
        await contracts.scanners.connect(manager).adminRegister(scanner.id, scanner.owner, scanner.chainId, 'data');
        await contracts.staking.connect(staker).deposit(0, scanner.id, MIN_STAKE_MANAGED);
        await contracts.staking.connect(staker).safeTransferFrom(staker.address, scanner.owner, subjectToActive(0, scanner.id), MIN_STAKE_MANAGED, ethers.constants.HashZero);
    }
}

let cache;
describe('Scanner 2 Scanner pool script', function () {
    prepare({
        stake: {
            scanners: { min: MIN_STAKE_MANAGED, max: MAX_STAKE_MANAGED, activated: true },
        },
    });
    beforeEach(async function () {
        await this.token.connect(this.accounts.minter).mint(this.accounts.user1.address, ethers.utils.parseEther('100000000'));
        await this.token.connect(this.accounts.user1).approve(this.staking.address, ethers.constants.MaxUint256);
    });
    it.skip('skips migrated, if disabled, if opting out, and if active stake below minimum', function () {
        const firstPool = require('./data/first-pool.json');
        const scanners = firstPool['137']['0xc29af06142138f893e3f1c1d11aa98c3313b8c1f']['scanner-registry'];
        const ids = Object.keys(scanners);
        const output = {};
        output[ids[0]] = scanners[ids[0]];
        expect(filterNonMigrations(scanners)).to.deep.eq(output);
    });
    describe.skip('Migrate First Scanners Mint Pool', function () {
        it('migrates first pool and updates doc', async function () {
            fs.copyFileSync('./test/migration/data/first-pool.json', './test/migration/data/t-first-pool.json');
            cache = new AsyncConf({ cwd: __dirname, configName: './data/t-first-pool' });
            const chainId = '137';
            const owner = '0xc29af06142138f893e3f1c1d11aa98c3313b8c1f';
            const scanners = await cache.get(`${chainId}.${owner}.scanner-registry`);
            await prepareScanners(this.contracts, scanners, this.accounts.user1, this.accounts.manager);
            await upgrade(this.contracts);
            let scannersAddresses = [];

            Object.keys(scanners).forEach((scanner) => {
                scannersAddresses.push(scanner);
            });

            await migrateScannersMintPool(cache, this.contracts.scannerToScannerPoolMigration.connect(this.accounts.manager), owner, chainId, scannersAddresses);
            expect(await cache.get(`${chainId}.${owner}.poolId`)).to.eq('1');
            for (const id of Object.keys(scanners)) {
                scanners[id].migrated = true;
            }

            expect(await cache.get(`${chainId}.${owner}.scanner-registry`)).to.deep.eq(scanners);

            for (const id of Object.keys(scanners)) {
                const scanner = scanners[id];
                expect(await this.scanners.balanceOf(scanner.owner)).to.eq(0);
                expect(await this.scanners.isRegistered(scanner.id)).to.eq(false);
                expect(await this.staking.activeStakeFor(0, scanner.id)).to.eq(0);
                expect(await this.scannerPools.balanceOf(scanner.owner)).to.eq(1);
                expect(await this.scannerPools.getScannerState(scanner.id)).to.deep.eq([
                    true,
                    ethers.utils.getAddress(scanner.owner),
                    ethers.BigNumber.from(scanner.chainId),
                    'data',
                    true,
                    false,
                ]);
            }
            expect(await this.staking.activeStakeFor(2, 1)).to.eq(MIN_STAKE_MANAGED * Object.keys(scanners).length);
        });
    });
    describe.skip('migrateScannersMintPool', function () {
        it('poolId 0, skip migrated and opting out', async function () {
            fs.copyFileSync('./test/migration/data/first-pool.json', './test/migration/data/t-first-pool.json');
            cache = new AsyncConf({ cwd: __dirname, configName: './data/t-first-pool' });
            const chainId = '137';
            const owner = '0xc29af06142138f893e3f1c1d11aa98c3313b8c1f';
            const scanners = await cache.get(`${chainId}.${owner}.scanner-registry`);
            await prepareScanners(this.contracts, scanners, this.accounts.user1, this.accounts.manager);
            await upgrade(this.contracts);
            await migrateScannersMintPool(cache, this.scannerToScannerPoolMigration.connect(this.accounts.manager), owner, chainId, Object.keys(scanners));
            expect(await cache.get(`${chainId}.${owner}.poolId`)).to.eq('1');
            for (const id of Object.keys(scanners)) {
                scanners[id].migrated = true;
            }

            expect(await cache.get(`${chainId}.${owner}.scanner-registry`)).to.deep.eq(scanners);

            for (const id of Object.keys(scanners)) {
                const scanner = scanners[id];
                expect(await this.scanners.balanceOf(scanner.owner)).to.eq(0);
                expect(await this.scanners.isRegistered(scanner.id)).to.eq(false);
                expect(await this.staking.activeStakeFor(0, scanner.id)).to.eq(0);
                expect(await this.scannerPools.balanceOf(scanner.owner)).to.eq(1);
                expect(await this.scannerPools.getScannerState(scanner.id)).to.deep.eq([
                    true,
                    ethers.utils.getAddress(scanner.owner),
                    ethers.BigNumber.from(scanner.chainId),
                    'data',
                    true,
                    false,
                ]);
            }
            expect(await this.staking.activeStakeFor(2, 1)).to.eq(MIN_STAKE_MANAGED * Object.keys(scanners).length);
        });

        it('poolId 1, not minting', async function () {
            fs.copyFileSync('./test/migration/data/first-pool.json', './test/migration/data/t-first-pool.json');
            cache = new AsyncConf({ cwd: __dirname, configName: './data/t-first-pool' });
            const chainId = '137';
            const owner = '0xc29af06142138f893e3f1c1d11aa98c3313b8c1f';
            const scanners = await cache.get(`${chainId}.${owner}.scanner-registry`);
            await prepareScanners(this.contracts, scanners, this.accounts.user1, this.accounts.manager);
            await upgrade(this.contracts);
            await migrateScannersMintPool(cache, this.scannerToScannerPoolMigration.connect(this.accounts.manager), owner, chainId, Object.keys(scanners));
            expect(await cache.get(`${chainId}.${owner}.poolId`)).to.eq('1');
            for (const id of Object.keys(scanners)) {
                scanners[id].migrated = true;
            }

            expect(await cache.get(`${chainId}.${owner}.scanner-registry`)).to.deep.eq(scanners);

            for (const id of Object.keys(scanners)) {
                const scanner = scanners[id];
                expect(await this.scanners.balanceOf(scanner.owner)).to.eq(0);
                expect(await this.scanners.isRegistered(scanner.id)).to.eq(false);
                expect(await this.staking.activeStakeFor(0, scanner.id)).to.eq(0);
                expect(await this.scannerPools.balanceOf(scanner.owner)).to.eq(1);
                expect(await this.scannerPools.getScannerState(scanner.id)).to.deep.eq([
                    true,
                    ethers.utils.getAddress(scanner.owner),
                    ethers.BigNumber.from(scanner.chainId),
                    'data',
                    true,
                    false,
                ]);
            }
            expect(await this.staking.activeStakeFor(2, 1)).to.eq(MIN_STAKE_MANAGED * Object.keys(scanners).length);
        });
    });
    describe.skip('migratePool', function () {
        it('poolId 0, chunk with minting and ignoring prev migrated and opted out', async function () {
            fs.copyFileSync('./test/migration/data/migrate-pool.json', './test/migration/data/t-migrate-pool-id-0-chunk.json');
            cache = new AsyncConf({ cwd: __dirname, configName: './data/t-migrate-pool-id-0-chunk' });
            const chainId = '137';
            const owner = '0xfe1c1cceccab539f6095ac07a369cdd669171e9d';
            const scanners = await cache.get(`${chainId}.${owner}.scanner-registry`);
            await prepareScanners(this.contracts, scanners, this.accounts.user1, this.accounts.manager);
            await upgrade(this.contracts);
            await migratePool(cache, this.scannerToScannerPoolMigration.connect(this.accounts.manager), owner, chainId, 2, 1);
            expect(await cache.get(`${chainId}.${owner}.poolId`)).to.eq('1');
            for (const id of Object.keys(scanners)) {
                scanners[id].migrated = !scanners[id].optingOut;
            }
            const ids = Object.keys(scanners);
            expect(await cache.get(`${chainId}.${owner}.scanner-registry`)).to.deep.eq(scanners);

            const nonMigrated = ids.slice(0, 2);
            const migrated = ids.slice(2);
            expect(await this.scannerPools.balanceOf(owner)).to.eq(1);
            expect(await this.scannerPools.totalScannersRegistered(1)).to.eq(migrated.length);
            expect(await this.scanners.balanceOf(owner)).to.eq(nonMigrated.length);

            for (const id of nonMigrated) {
                expect(await this.scanners.isRegistered(id)).to.eq(true);
                expect(await this.staking.activeStakeFor(0, id)).to.eq(MIN_STAKE_MANAGED);
            }
            expect(await this.staking.activeStakeFor(2, 1)).to.eq(MIN_STAKE_MANAGED * migrated.length);

            for (const id of migrated) {
                expect(await this.scanners.isRegistered(id)).to.eq(false);
                expect(await this.staking.activeStakeFor(0, id)).to.eq(0);
                expect(await this.scannerPools.getScannerState(id)).to.deep.eq([true, ethers.utils.getAddress(owner), ethers.BigNumber.from(chainId), 'data', true, false]);
            }
        });

        it('poolId 2, 100 chunk, 50 callChunk', async function () {
            fs.copyFileSync('./test/migration/data/migrate-pool.json', './test/migration/data/t-migrate-pool-id-2-chunk-100.json');
            cache = new AsyncConf({ cwd: __dirname, configName: './data/t-migrate-pool-id-2-chunk-100' });
            const chainId = '137';
            const owner = '0x3f7042c827a0d326c755741ad08d24bc61ea6d34';
            const scanners = await cache.get(`${chainId}.${owner}.scanner-registry`);
            await prepareScanners(this.contracts, scanners, this.accounts.user1, this.accounts.manager);
            await upgrade(this.contracts);
            await this.scannerPools.connect(this.accounts.user1).registerScannerPool('137');
            await this.scannerPools.connect(this.accounts.user1).registerScannerPool('137');
            await this.scannerPools.connect(this.accounts.user1).transferFrom(this.accounts.user1.address, owner, 2);

            await migratePool(cache, this.scannerToScannerPoolMigration.connect(this.accounts.manager), owner, chainId, 100, 50);
            expect(await cache.get(`${chainId}.${owner}.poolId`)).to.eq(2);
            for (const id of Object.keys(scanners)) {
                scanners[id].migrated = true;
            }
            expect(await cache.get(`${chainId}.${owner}.scanner-registry`)).to.deep.eq(scanners);

            for (const id of Object.keys(scanners)) {
                const scanner = scanners[id];
                expect(await this.scanners.balanceOf(scanner.owner)).to.eq(0);
                expect(await this.scanners.isRegistered(scanner.id)).to.eq(false);
                expect(await this.staking.activeStakeFor(0, scanner.id)).to.eq(0);
                expect(await this.scannerPools.isScannerRegisteredTo(scanner.id, 2)).to.eq(true);
                expect(await this.scannerPools.balanceOf(scanner.owner)).to.eq(1);
                expect(await this.scannerPools.getScannerState(scanner.id)).to.deep.eq([
                    true,
                    ethers.utils.getAddress(scanner.owner),
                    ethers.BigNumber.from(scanner.chainId),
                    'data',
                    true,
                    false,
                ]);
            }
            expect(await this.staking.activeStakeFor(2, 2)).to.eq(MIN_STAKE_MANAGED * Object.keys(scanners).length);
        });

        it('poolId 2, 1 chunk, 5 callChunkSize', async function () {
            fs.copyFileSync('./test/migration/data/migrate-pool.json', './test/migration/data/t-migrate-pool-id-2-chunk-100.json');
            cache = new AsyncConf({ cwd: __dirname, configName: './data/t-migrate-pool-id-2-chunk-100' });
            const chainId = '137';
            const owner = '0x3f7042c827a0d326c755741ad08d24bc61ea6d34';
            const scanners = await cache.get(`${chainId}.${owner}.scanner-registry`);
            await prepareScanners(this.contracts, scanners, this.accounts.user1, this.accounts.manager);
            await upgrade(this.contracts);
            await this.scannerPools.connect(this.accounts.user1).registerScannerPool('137');
            await this.scannerPools.connect(this.accounts.user1).registerScannerPool('137');
            await this.scannerPools.connect(this.accounts.user1).transferFrom(this.accounts.user1.address, owner, 2);

            await migratePool(cache, this.scannerToScannerPoolMigration.connect(this.accounts.manager), owner, chainId, 1, 5);
            expect(await cache.get(`${chainId}.${owner}.poolId`)).to.eq(2);
            for (const id of Object.keys(scanners)) {
                scanners[id].migrated = true;
            }
            expect(await cache.get(`${chainId}.${owner}.scanner-registry`)).to.deep.eq(scanners);

            for (const id of Object.keys(scanners)) {
                const scanner = scanners[id];
                expect(await this.scanners.balanceOf(scanner.owner)).to.eq(0);
                expect(await this.scanners.isRegistered(scanner.id)).to.eq(false);
                expect(await this.staking.activeStakeFor(0, scanner.id)).to.eq(0);
                expect(await this.scannerPools.isScannerRegisteredTo(scanner.id, 2)).to.eq(true);
                expect(await this.scannerPools.balanceOf(scanner.owner)).to.eq(1);
                expect(await this.scannerPools.getScannerState(scanner.id)).to.deep.eq([
                    true,
                    ethers.utils.getAddress(scanner.owner),
                    ethers.BigNumber.from(scanner.chainId),
                    'data',
                    true,
                    false,
                ]);
            }
            expect(await this.staking.activeStakeFor(2, 2)).to.eq(MIN_STAKE_MANAGED * Object.keys(scanners).length);
        });
    });
    describe.skip('Full test', function () {
        it('migrate multi chain', async function () {
            fs.copyFileSync('./test/migration/data/multi-chain.json', './test/migration/data/t-multi-chain.json');
            cache = new AsyncConf({ cwd: __dirname, configName: './data/t-multi-chain' });

            const data = require('./data/t-multi-chain.json');
            const chainId = 137;
            console.log('Preparing chain Id', chainId);
            let owners = Object.keys(data[chainId]);
            for (const owner of owners) {
                console.log('Set scanners for owner ', owner);
                const scanners = await cache.get(`${chainId}.${owner}.scanner-registry`);
                await prepareScanners(this.contracts, scanners, this.accounts.user1, this.accounts.manager);
                for (const id of Object.keys(scanners)) {
                    scanners[id].migrated = true;
                }
            }

            await upgrade(this.contracts);

            console.log('Run');
            await scanner2ScannerPool({
                chunkSize: 5,
                callChunkSize: 10,
                scannersFilePath: '../../test/migration/data/t-multi-chain.json',
                deployer: this.accounts.manager,
                network: await this.accounts.manager.provider.getNetwork(),
                contracts: this.contracts,
                chainId: chainId,
            });
            console.log('Checking');

            let poolId = 0;
            for (const owner of owners) {
                expect(await cache.get(`${chainId}.${owner}.poolId`)).to.eq(`${++poolId}`);
                const scanners = await cache.get(`${chainId}.${owner}.scanner-registry`);
                const dataScanners = data[`${chainId}`][owner]['scanner-registry'];
                for (const id of Object.keys(dataScanners)) {
                    scanners[id].migrated = true;
                }
                expect(await cache.get(`${chainId}.${owner}.scanner-registry`)).to.deep.eq(scanners);
                expect(await this.staking.activeStakeFor(2, poolId)).to.eq(MIN_STAKE_MANAGED * Object.keys(scanners).length);
                for (const id of Object.keys(scanners)) {
                    const scanner = scanners[id];
                    expect(await this.scanners.balanceOf(scanner.owner)).to.eq(0);
                    expect(await this.scanners.isRegistered(scanner.id)).to.eq(false);
                    expect(await this.staking.activeStakeFor(0, scanner.id)).to.eq(0);
                    expect(await this.scannerPools.balanceOf(scanner.owner)).to.eq(1);
                    expect(await this.scannerPools.isScannerRegisteredTo(scanner.id, poolId)).to.eq(true);
                    expect(await this.scannerPools.getScannerState(scanner.id)).to.deep.eq([
                        true,
                        ethers.utils.getAddress(scanner.owner),
                        ethers.BigNumber.from(scanner.chainId),
                        'data',
                        true,
                        false,
                    ]);
                }
            }
        });
    });
});
