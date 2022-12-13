const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('./fixture');
const scannerData = require('../../scripts/data/scanners/matic/scanners.json');
const { AsyncConf } = require('../../scripts/utils');
const { subjectToActive } = require('../../scripts/utils/staking.js');
const { migrateScannersMintPool, migratePool, scanner2ScannerPool } = require('../../scripts/scanner-migration/migrate-scanners');
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

    await contracts.scanners.configureMigration(10000 + (await ethers.provider.getBlock('latest')).timestamp, contracts.scannerPools.address);

    // Increase time to after migration
    await ethers.provider.send('evm_setNextBlockTimestamp', [(await contracts.scanners.sunsettingTime()).toNumber() + 1]);
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
    describe('Migrate First Scanners Mint Pool', function () {
        it.only('migrates first pool and updates doc', async function () {
            fs.copyFileSync('./test/migration/data/first-pool.json', './test/migration/data/t-first-pool.json');
            cache = new AsyncConf({ cwd: __dirname, configName: './data/t-first-pool' });
            const chainId = '137';
            const owner = '0xc29af06142138f893e3f1c1d11aa98c3313b8c1f';
            const scanners = await cache.get(`${chainId}.${owner}.scanners`);
            await prepareScanners(this.contracts, scanners, this.accounts.user1, this.accounts.manager);
            await upgrade(this.contracts);
            await migrateScannersMintPool(cache, this.registryMigration.connect(this.accounts.manager), owner, chainId, scanners);
            expect(await cache.get(`${chainId}.${owner}.poolId`)).to.eq('1');
            for (const id of Object.keys(scanners)) {
                scanners[id].migrated = true;
            }

            expect(await cache.get(`${chainId}.${owner}.scanners`)).to.deep.eq(scanners);

            for (const id of Object.keys(scanners)) {
                const scanner = scanners[id];
                expect(await this.scanners.balanceOf(scanner.owner)).to.eq(0);
                expect(await this.scanners.isRegistered(scanner.id)).to.eq(false);
                expect(await this.staking.activeStakeFor(0, scanner.id)).to.eq(0);
                expect(await this.staking.activeStakeFor(2, 1)).to.eq(MIN_STAKE_MANAGED * Object.keys(scanners).length);
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
        });
    });
    describe('Migrate Pool', function () {
        it.only('poolId 0, skip migrated', async function () {
            fs.copyFileSync('./test/migration/data/first-pool.json', './test/migration/data/t-first-pool.json');
            cache = new AsyncConf({ cwd: __dirname, configName: './data/t-first-pool' });
            const chainId = '137';
            const owner = '0xc29af06142138f893e3f1c1d11aa98c3313b8c1f';
            const scanners = await cache.get(`${chainId}.${owner}.scanners`);
            await prepareScanners(this.contracts, scanners, this.accounts.user1, this.accounts.manager);
            await upgrade(this.contracts);
            await migrateScannersMintPool(cache, this.registryMigration.connect(this.accounts.manager), owner, chainId, scanners);
            expect(await cache.get(`${chainId}.${owner}.poolId`)).to.eq('1');
            for (const id of Object.keys(scanners)) {
                scanners[id].migrated = true;
            }

            expect(await cache.get(`${chainId}.${owner}.scanners`)).to.deep.eq(scanners);

            for (const id of Object.keys(scanners)) {
                const scanner = scanners[id];
                expect(await this.scanners.balanceOf(scanner.owner)).to.eq(0);
                expect(await this.scanners.isRegistered(scanner.id)).to.eq(false);
                expect(await this.staking.activeStakeFor(0, scanner.id)).to.eq(0);
                expect(await this.staking.activeStakeFor(2, 1)).to.eq(MIN_STAKE_MANAGED * Object.keys(scanners).length);
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
        });
        it('poolId 0, chunk', async function () {});
        it('poolId 1, chunk', async function () {});
        it('report error', async function () {});
    });
    describe.skip('Full test', function () {
        beforeEach(async function () {
            const chains = Object.keys(scannerData);
            for (const chain of chains) {
                console.log('Chain', chain);
                await this.scanners.connect(this.accounts.manager).setStakeThreshold({ min: '100', max: '500', activated: true }, chain);
                await this.scannerPools.connect(this.accounts.manager).setManagedStakeThreshold({ min: '100', max: '500', activated: true }, chain);
                const owners = Object.keys(scannerData[chains]);
                for (const owner of owners) {
                    console.log('Owner', owner);
                    for (const scanner of owners[owner].scanners) {
                        console.log('Scanner', scanner.address);
                        await this.scanners.connect(this.accounts.manager).adminRegister(scanner.id, owner, scanner.chainId, '');
                        if (scanner.enabled) {
                            await this.scanners.connect(this.accounts.manager).disableScanner(scanner.id, 0);
                        } else {
                            await this.staking.connect(this.accounts.user1).deposit(0, scanner.address, '100');
                            await this.staking
                                .connect(this.accounts.user1)
                                .safeTransferFrom(this.accounts.user1, owner, subjectToActive(0, scanner.id), '100', ethers.constants.HashZero);
                        }
                    }
                }
            }

            const NewImplementation = await ethers.getContractFactory('ScannerRegistry');
            this.scanners = await upgrades.upgradeProxy(this.scanners.address, NewImplementation, {
                constructorArgs: [this.contracts.forwarder.address],
                unsafeAllow: ['delegatecall'],
            });
            const { timestamp } = await this.accounts.user1.provider.getBlock('latest');
            await this.scanners.connect(this.accounts.admin).configureMigration(timestamp + 5000, await this.scannerPools.address);

            const deployer = (await ethers.getSigners())[0];

            const ScannerToScannerPoolMigration = await ethers.getContractFactory('ScannerToScannerPoolMigration', deployer);
            this.registryMigration = await upgrades.deployProxy(ScannerToScannerPoolMigration, [this.access.address], {
                kind: 'uups',
                constructorArgs: [this.forwarder.address, this.scanners.address, this.scannerPools.address, this.staking.address],
                unsafeAllow: 'delegatecall',
            });

            this.access.connect(this.accounts.admin).grantRole(this.roles.SCANNER_2_SCANNER_POOL_MIGRATOR, this.registryMigration.address);
        });

        it('migrates', async function () {
            await scanner2ScannerPool({});
        });
    });
});
