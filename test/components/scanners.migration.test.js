const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');
const { BigNumber } = require('ethers');

describe('Scanner Registry (Deprecation and migration)', function () {
    prepare({ stake: { min: '0', max: '500', activated: true } });
    let SCANNERS;
    const chainId = 1;
    it('upgrade: deprecated implementation keeps storage', async function () {
        this.accounts.getAccount('scanner');

        const ScannerRegistry_0_1_3 = await ethers.getContractFactory('ScannerRegistry_0_1_3');
        // Router is deprecated, just set an address
        this.scanners = await upgrades.deployProxy(ScannerRegistry_0_1_3, [this.contracts.access.address, 'Forta Scanners', 'FScanners'], {
            kind: 'uups',
            constructorArgs: [this.contracts.forwarder.address],
            unsafeAllow: ['delegatecall'],
        });
        await this.scanners.deployed();
        await this.scanners.connect(this.accounts.manager).setStakeThreshold({ min: '0', max: '500', activated: true }, chainId);
        const SCANNERS = [this.accounts.scanner, this.accounts.user1, this.accounts.user3];

        for (let i = 0; i < SCANNERS.length; i++) {
            const scannerId = SCANNERS[i].address;
            await this.scanners.connect(SCANNERS[i]).register(this.accounts.user1.address, chainId, `metadata-${i}`);
            await this.scanners.connect(this.accounts.user1).setManager(scannerId, this.accounts.user2.address, true);
            const mustDisable = i === SCANNERS.length - 1;
            const disabledFlags = mustDisable ? 1 : 0;
            if (mustDisable) {
                await this.scanners.connect(this.accounts.manager).disableScanner(scannerId, 0);
            }
            expect(await this.scanners.isEnabled(scannerId)).to.be.equal(!mustDisable);

            expect(await this.scanners.isManager(scannerId, this.accounts.user2.address)).to.be.equal(true);
            expect(await this.scanners.getManagerCount(scannerId)).to.be.equal(1);
            expect(await this.scanners.getManagerAt(scannerId, 0)).to.be.equal(this.accounts.user2.address);
            expect(
                await this.scanners
                    .getScannerState(scannerId)
                    .then((scanner) => [scanner.registered, scanner.owner, scanner.chainId.toNumber(), scanner.metadata, scanner.enabled, scanner.disabledFlags.toNumber()])
            ).to.be.deep.equal([true, this.accounts.user1.address, chainId, `metadata-${i}`, !mustDisable, disabledFlags]);
            expect(await this.scanners.isRegistered(scannerId)).to.be.equal(true);
            expect(await this.scanners.ownerOf(scannerId)).to.be.equal(this.accounts.user1.address);
        }
        this.scanners = await upgrades.upgradeProxy(this.scanners.address, await ethers.getContractFactory('ScannerRegistry'), {
            constructorArgs: [this.contracts.forwarder.address],
            unsafeAllow: ['delegatecall'],
            unsafeSkipStorageCheck: true,
        });

        for (let i = 0; i < SCANNERS.length; i++) {
            const disabled = i === SCANNERS.length - 1;
            const scannerId = SCANNERS[i].address;

            expect(await this.scanners.isManager(scannerId, this.accounts.user2.address)).to.be.equal(true);
            expect(await this.scanners.getManagerCount(scannerId)).to.be.equal(1);
            expect(await this.scanners.getManagerAt(scannerId, 0)).to.be.equal(this.accounts.user2.address);
            expect(
                await this.scanners
                    .getScannerState(scannerId)
                    .then((scanner) => [scanner.registered, scanner.owner, scanner.chainId.toNumber(), scanner.metadata, scanner.enabled, scanner.disabledFlags.toNumber()])
            ).to.be.deep.equal([true, this.accounts.user1.address, chainId, `metadata-${i}`, !disabled, disabled ? 1 : 0]);
            expect(await this.scanners.isRegistered(scannerId)).to.be.equal(true);
            expect(await this.scanners.ownerOf(scannerId)).to.be.equal(this.accounts.user1.address);
            expect(await this.scanners.isEnabled(scannerId)).to.be.equal(!disabled);
        }
    });

    describe('Migration', () => {
        beforeEach(async function () {
            // Go back in time before migration end
            await ethers.provider.send('evm_setNextBlockTimestamp', [(await this.registryMigration.migrationEndTime()).toNumber() - 5000]);
            await ethers.provider.send('evm_mine');

            this.accounts.getAccount('scanner');

            const ScannerRegistry_0_1_3 = await ethers.getContractFactory('ScannerRegistry_0_1_3');
            // Router is deprecated, just set an address
            this.scanners = await upgrades.deployProxy(ScannerRegistry_0_1_3, [this.contracts.access.address, 'Forta Scanners', 'FScanners'], {
                kind: 'uups',
                constructorArgs: [this.contracts.forwarder.address],
                unsafeAllow: ['delegatecall'],
            });
            await this.scanners.deployed();
            await this.scanners.connect(this.accounts.manager).setStakeThreshold({ min: '0', max: '500', activated: true }, chainId);

            SCANNERS = [this.accounts.scanner, this.accounts.user1, this.accounts.user2, this.accounts.user3, this.accounts.other];
            for (let i = 0; i < SCANNERS.length; i++) {
                const scannerId = SCANNERS[i].address;

                await this.scanners.connect(SCANNERS[i]).register(this.accounts.user1.address, chainId, `metadata-${i}`);

                const mustDisable = i === SCANNERS.length - 1;
                if (mustDisable) {
                    await this.scanners.connect(this.accounts.manager).disableScanner(scannerId, 0);
                }
            }
            const NewImplementation = await ethers.getContractFactory('ScannerRegistry');
            this.scanners = await upgrades.upgradeProxy(this.scanners.address, NewImplementation, {
                constructorArgs: [this.contracts.forwarder.address],
                unsafeAllow: ['delegatecall'],
                unsafeSkipStorageCheck: true,
            });

            await this.registryMigration.connect(this.accounts.admin).setScannerNodeRegistry(this.scanners.address);
        });

        it('should not burn ScannerNodeRegistry without NODE_RUNNER_MIGRATOR_ROLE', async function () {
            await expect(this.scanners.connect(this.accounts.user1).deregisterScannerNode(SCANNERS[0].address)).to.be.revertedWith(
                `MissingRole("${this.roles.NODE_RUNNER_MIGRATOR}", "${this.accounts.user1.address}")`
            );
        });

        describe('migrate scanners - priviledged path', function () {
            it('non-registered node runner - 1 disabled scanenr', async function () {
                const inputNodeRunnerId = await this.registryMigration.NODE_RUNNER_NOT_MIGRATED();
                expect(await this.scanners.balanceOf(this.accounts.user1.address)).to.eq(SCANNERS.length);

                await expect(
                    this.registryMigration.connect(this.accounts.manager).migrate(
                        SCANNERS.map((x) => x.address),
                        inputNodeRunnerId,
                        this.accounts.user1.address
                    )
                )
                    .to.emit(this.registryMigration, 'MigrationExecuted')
                    .withArgs(4, 1, 1, true);
                let nodeRunnerId = 1;
                expect(await this.nodeRunners.balanceOf(this.accounts.user1.address)).to.eq(1);
                expect(await this.nodeRunners.isRegistered(nodeRunnerId)).to.eq(true);
                expect(await this.nodeRunners.ownerOf(1)).to.eq(this.accounts.user1.address);
                expect(await this.nodeRunners.totalScannersRegistered(1)).to.eq(SCANNERS.length - 1);
                expect(await this.scanners.balanceOf(this.accounts.user1.address)).to.eq(1);

                for (let i = 0; i < SCANNERS.length - 1; i++) {
                    const scannerId = SCANNERS[i].address;

                    expect(await this.scanners.isRegistered(scannerId)).to.be.equal(false);
                    expect(await this.scanners.getManagerCount(scannerId)).to.be.equal(0);
                    expect(
                        await this.nodeRunners
                            .getScannerState(scannerId)
                            .then((scanner) => [scanner.registered, scanner.owner, scanner.chainId.toNumber(), scanner.metadata, scanner.operational, scanner.disabled])
                    ).to.be.deep.equal([true, this.accounts.user1.address, chainId, `metadata-${i}`, true, false]);
                    expect(await this.nodeRunners.isScannerRegistered(scannerId)).to.be.equal(true);
                    expect(await this.nodeRunners.isScannerRegisteredTo(scannerId, nodeRunnerId)).to.be.equal(true);
                    expect(await this.nodeRunners.registeredScannerAddressAtIndex(nodeRunnerId, i)).to.be.equal(scannerId);
                    expect(await this.nodeRunners.isDisabled(scannerId)).to.be.equal(false);
                }
                const scannerId = SCANNERS[SCANNERS.length - 1].address;
                expect(await this.scanners.isRegistered(scannerId)).to.be.equal(true);
                expect(await this.scanners.getManagerCount(scannerId)).to.be.equal(0);

                expect(
                    await this.nodeRunners
                        .getScannerState(scannerId)
                        .then((scanner) => [scanner.registered, scanner.owner, scanner.chainId.toNumber(), scanner.metadata, scanner.operational, scanner.disabled])
                ).to.be.deep.equal([false, ethers.constants.AddressZero, 0, ``, false, false]);

                expect(await this.nodeRunners.isScannerRegistered(scannerId)).to.be.equal(false);
                expect(await this.nodeRunners.isScannerRegisteredTo(scannerId, 1)).to.be.equal(false);
                expect(await this.nodeRunners.isDisabled(scannerId)).to.be.equal(false);
            });

            it('registered node runner - 1 disabled scanner', async function () {
                expect(await this.scanners.balanceOf(this.accounts.user1.address)).to.eq(SCANNERS.length);
                await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner();
                const inputNodeRunnerId = 1;
                await expect(
                    this.registryMigration.connect(this.accounts.manager).migrate(
                        SCANNERS.map((x) => x.address),
                        inputNodeRunnerId,
                        this.accounts.user1.address
                    )
                )
                    .to.emit(this.registryMigration, 'MigrationExecuted')
                    .withArgs(4, 1, 1, false);
                let nodeRunnerId = 1;
                expect(await this.nodeRunners.balanceOf(this.accounts.user1.address)).to.eq(1);
                expect(await this.nodeRunners.isRegistered(nodeRunnerId)).to.eq(true);
                expect(await this.nodeRunners.ownerOf(1)).to.eq(this.accounts.user1.address);
                expect(await this.nodeRunners.totalScannersRegistered(1)).to.eq(SCANNERS.length - 1);
                expect(await this.scanners.balanceOf(this.accounts.user1.address)).to.eq(1);

                for (let i = 0; i < SCANNERS.length - 1; i++) {
                    const scannerId = SCANNERS[i].address;

                    expect(await this.scanners.isRegistered(scannerId)).to.be.equal(false);
                    expect(await this.scanners.getManagerCount(scannerId)).to.be.equal(0);
                    expect(
                        await this.nodeRunners
                            .getScannerState(scannerId)
                            .then((scanner) => [scanner.registered, scanner.owner, scanner.chainId.toNumber(), scanner.metadata, scanner.operational, scanner.disabled])
                    ).to.be.deep.equal([true, this.accounts.user1.address, chainId, `metadata-${i}`, true, false]);
                    expect(await this.nodeRunners.isScannerRegistered(scannerId)).to.be.equal(true);
                    expect(await this.nodeRunners.isScannerRegisteredTo(scannerId, nodeRunnerId)).to.be.equal(true);
                    expect(await this.nodeRunners.registeredScannerAddressAtIndex(nodeRunnerId, i)).to.be.equal(scannerId);
                    expect(await this.nodeRunners.isDisabled(scannerId)).to.be.equal(false);
                }
                const scannerId = SCANNERS[SCANNERS.length - 1].address;
                expect(await this.scanners.isRegistered(scannerId)).to.be.equal(true);
                expect(await this.scanners.getManagerCount(scannerId)).to.be.equal(0);

                expect(
                    await this.nodeRunners
                        .getScannerState(scannerId)
                        .then((scanner) => [scanner.registered, scanner.owner, scanner.chainId.toNumber(), scanner.metadata, scanner.operational, scanner.disabled])
                ).to.be.deep.equal([false, ethers.constants.AddressZero, 0, ``, false, false]);

                expect(await this.nodeRunners.isScannerRegistered(scannerId)).to.be.equal(false);
                expect(await this.nodeRunners.isScannerRegisteredTo(scannerId, 1)).to.be.equal(false);
                expect(await this.nodeRunners.isDisabled(scannerId)).to.be.equal(false);
            });

            it('should not migrate if not MIGRATION_EXECUTOR_ROLE', async function () {
                expect(await this.scanners.balanceOf(this.accounts.user1.address)).to.eq(SCANNERS.length);
                await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner();
                const inputNodeRunnerId = 1;
                await expect(
                    this.registryMigration.connect(this.accounts.user1).migrate(
                        SCANNERS.map((x) => x.address),
                        inputNodeRunnerId,
                        this.accounts.user1.address
                    )
                ).to.be.revertedWith(`MissingRole("${this.roles.MIGRATION_EXECUTOR}", "${this.accounts.user1.address}")`);
            });

            it('should not migrate if not owner of the scanners', async function () {
                expect(await this.scanners.balanceOf(this.accounts.user1.address)).to.eq(SCANNERS.length);
                await this.nodeRunners.connect(this.accounts.user2).registerNodeRunner();
                const inputNodeRunnerId = 1;
                await expect(
                    this.registryMigration.connect(this.accounts.manager).migrate(
                        SCANNERS.map((x) => x.address),
                        inputNodeRunnerId,
                        this.accounts.user2.address
                    )
                ).to.be.revertedWith(`SenderNotOwner("${this.accounts.user2.address}", 201990263407130541861732429012178345511141645967)`);
            });

            it('should not migrate if not owner of node runner', async function () {
                expect(await this.scanners.balanceOf(this.accounts.user1.address)).to.eq(SCANNERS.length);
                await this.nodeRunners.connect(this.accounts.user2).registerNodeRunner();
                const inputNodeRunnerId = 1;
                await expect(
                    this.registryMigration.connect(this.accounts.manager).migrate(
                        SCANNERS.map((x) => x.address),
                        inputNodeRunnerId,
                        this.accounts.user1.address
                    )
                ).to.be.revertedWith(`NotOwnerOfNodeRunner("${this.accounts.user1.address}", ${inputNodeRunnerId})`);
            });
        });

        describe('migrate scanners - self migration path', function () {
            it('non-registered node runner - 1 disabled scanenr', async function () {
                const inputNodeRunnerId = await this.registryMigration.NODE_RUNNER_NOT_MIGRATED();
                expect(await this.scanners.balanceOf(this.accounts.user1.address)).to.eq(SCANNERS.length);

                await expect(
                    this.registryMigration.connect(this.accounts.user1).selfMigrate(
                        SCANNERS.map((x) => x.address),
                        inputNodeRunnerId
                    )
                )
                    .to.emit(this.registryMigration, 'MigrationExecuted')
                    .withArgs(4, 1, 1, true);
                let nodeRunnerId = 1;
                expect(await this.nodeRunners.balanceOf(this.accounts.user1.address)).to.eq(1);
                expect(await this.nodeRunners.isRegistered(nodeRunnerId)).to.eq(true);
                expect(await this.nodeRunners.ownerOf(1)).to.eq(this.accounts.user1.address);
                expect(await this.nodeRunners.totalScannersRegistered(1)).to.eq(SCANNERS.length - 1);
                expect(await this.scanners.balanceOf(this.accounts.user1.address)).to.eq(1);

                for (let i = 0; i < SCANNERS.length - 1; i++) {
                    const scannerId = SCANNERS[i].address;

                    expect(await this.scanners.isRegistered(scannerId)).to.be.equal(false);
                    expect(await this.scanners.getManagerCount(scannerId)).to.be.equal(0);
                    expect(
                        await this.nodeRunners
                            .getScannerState(scannerId)
                            .then((scanner) => [scanner.registered, scanner.owner, scanner.chainId.toNumber(), scanner.metadata, scanner.operational, scanner.disabled])
                    ).to.be.deep.equal([true, this.accounts.user1.address, chainId, `metadata-${i}`, true, false]);
                    expect(await this.nodeRunners.isScannerRegistered(scannerId)).to.be.equal(true);
                    expect(await this.nodeRunners.isScannerRegisteredTo(scannerId, nodeRunnerId)).to.be.equal(true);
                    expect(await this.nodeRunners.registeredScannerAddressAtIndex(nodeRunnerId, i)).to.be.equal(scannerId);
                    expect(await this.nodeRunners.isDisabled(scannerId)).to.be.equal(false);
                }
                const scannerId = SCANNERS[SCANNERS.length - 1].address;
                expect(await this.scanners.isRegistered(scannerId)).to.be.equal(true);
                expect(await this.scanners.getManagerCount(scannerId)).to.be.equal(0);

                expect(
                    await this.nodeRunners
                        .getScannerState(scannerId)
                        .then((scanner) => [scanner.registered, scanner.owner, scanner.chainId.toNumber(), scanner.metadata, scanner.operational, scanner.disabled])
                ).to.be.deep.equal([false, ethers.constants.AddressZero, 0, ``, false, false]);

                expect(await this.nodeRunners.isScannerRegistered(scannerId)).to.be.equal(false);
                expect(await this.nodeRunners.isScannerRegisteredTo(scannerId, 1)).to.be.equal(false);
                expect(await this.nodeRunners.isDisabled(scannerId)).to.be.equal(false);
            });

            it('registered node runner - 1 disabled scanner', async function () {
                expect(await this.scanners.balanceOf(this.accounts.user1.address)).to.eq(SCANNERS.length);
                await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner();
                const inputNodeRunnerId = 1;
                await expect(
                    this.registryMigration.connect(this.accounts.user1).selfMigrate(
                        SCANNERS.map((x) => x.address),
                        inputNodeRunnerId
                    )
                )
                    .to.emit(this.registryMigration, 'MigrationExecuted')
                    .withArgs(4, 1, 1, false);
                let nodeRunnerId = 1;
                expect(await this.nodeRunners.balanceOf(this.accounts.user1.address)).to.eq(1);
                expect(await this.nodeRunners.isRegistered(nodeRunnerId)).to.eq(true);
                expect(await this.nodeRunners.ownerOf(1)).to.eq(this.accounts.user1.address);
                expect(await this.nodeRunners.totalScannersRegistered(1)).to.eq(SCANNERS.length - 1);
                expect(await this.scanners.balanceOf(this.accounts.user1.address)).to.eq(1);

                for (let i = 0; i < SCANNERS.length - 1; i++) {
                    const scannerId = SCANNERS[i].address;

                    expect(await this.scanners.isRegistered(scannerId)).to.be.equal(false);
                    expect(await this.scanners.getManagerCount(scannerId)).to.be.equal(0);
                    expect(
                        await this.nodeRunners
                            .getScannerState(scannerId)
                            .then((scanner) => [scanner.registered, scanner.owner, scanner.chainId.toNumber(), scanner.metadata, scanner.operational, scanner.disabled])
                    ).to.be.deep.equal([true, this.accounts.user1.address, chainId, `metadata-${i}`, true, false]);
                    expect(await this.nodeRunners.isScannerRegistered(scannerId)).to.be.equal(true);
                    expect(await this.nodeRunners.isScannerRegisteredTo(scannerId, nodeRunnerId)).to.be.equal(true);
                    expect(await this.nodeRunners.registeredScannerAddressAtIndex(nodeRunnerId, i)).to.be.equal(scannerId);
                    expect(await this.nodeRunners.isDisabled(scannerId)).to.be.equal(false);
                }
                const scannerId = SCANNERS[SCANNERS.length - 1].address;
                expect(await this.scanners.isRegistered(scannerId)).to.be.equal(true);
                expect(await this.scanners.getManagerCount(scannerId)).to.be.equal(0);

                expect(
                    await this.nodeRunners
                        .getScannerState(scannerId)
                        .then((scanner) => [scanner.registered, scanner.owner, scanner.chainId.toNumber(), scanner.metadata, scanner.operational, scanner.disabled])
                ).to.be.deep.equal([false, ethers.constants.AddressZero, 0, ``, false, false]);

                expect(await this.nodeRunners.isScannerRegistered(scannerId)).to.be.equal(false);
                expect(await this.nodeRunners.isScannerRegisteredTo(scannerId, 1)).to.be.equal(false);
                expect(await this.nodeRunners.isDisabled(scannerId)).to.be.equal(false);
            });

            it('should not migrate if not owner of the scanners', async function () {
                expect(await this.scanners.balanceOf(this.accounts.user1.address)).to.eq(SCANNERS.length);
                await this.nodeRunners.connect(this.accounts.user2).registerNodeRunner();
                const inputNodeRunnerId = 1;
                await expect(
                    this.registryMigration.connect(this.accounts.user2).selfMigrate(
                        SCANNERS.map((x) => x.address),
                        inputNodeRunnerId
                    )
                ).to.be.revertedWith(`SenderNotOwner("${this.accounts.user2.address}", 201990263407130541861732429012178345511141645967)`);
            });

            it('should not migrate if not owner of node runner', async function () {
                expect(await this.scanners.balanceOf(this.accounts.user1.address)).to.eq(SCANNERS.length);
                await this.nodeRunners.connect(this.accounts.user2).registerNodeRunner();
                const inputNodeRunnerId = 1;
                await expect(
                    this.registryMigration.connect(this.accounts.user1).selfMigrate(
                        SCANNERS.map((x) => x.address),
                        inputNodeRunnerId
                    )
                ).to.be.revertedWith(`NotOwnerOfNodeRunner("${this.accounts.user1.address}", ${inputNodeRunnerId})`);
            });
        });

        describe('ScannerNodeRegistry migration data source', function () {
            let nonMigrated, migrated;
            beforeEach(async function () {
                nonMigrated = SCANNERS[0].address;
                migrated = SCANNERS[1].address;
                await this.scanners.connect(this.accounts.admin).setMigrationController(this.registryMigration.address);
                await this.registryMigration.connect(this.accounts.user1).selfMigrate([migrated], 0);
                await this.nodeRunners.connect(this.accounts.user1).updateScannerMetadata(migrated, 'migrated');
                await this.nodeRunners.connect(this.accounts.user1).disableScanner(migrated);
            });

            describe('should return correct data', function () {
                it('during migration', async function () {
                    expect(await this.scanners.isEnabled(nonMigrated)).to.equal(true);
                    expect(await this.scanners.isEnabled(migrated)).to.equal(false);

                    expect(
                        await this.scanners.getScanner(nonMigrated).then((scanner) => [scanner.registered, scanner.owner, scanner.chainId.toNumber(), scanner.metadata])
                    ).to.be.deep.equal([true, this.accounts.user1.address, chainId, `metadata-0`]);
                    expect(
                        await this.scanners
                            .getScannerState(nonMigrated)
                            .then((scanner) => [scanner.registered, scanner.owner, scanner.chainId.toNumber(), scanner.metadata, scanner.enabled, scanner.disabledFlags])
                    ).to.be.deep.equal([true, this.accounts.user1.address, chainId, `metadata-0`, true, BigNumber.from(0)]);
                    expect(
                        await this.scanners.getScanner(migrated).then((scanner) => [scanner.registered, scanner.owner, scanner.chainId.toNumber(), scanner.metadata])
                    ).to.be.deep.equal([true, this.accounts.user1.address, chainId, `migrated`]);
                    expect(
                        await this.scanners
                            .getScannerState(migrated)
                            .then((scanner) => [scanner.registered, scanner.owner, scanner.chainId.toNumber(), scanner.metadata, scanner.enabled, scanner.disabledFlags])
                    ).to.be.deep.equal([true, this.accounts.user1.address, chainId, `migrated`, false, BigNumber.from(1)]);
                });

                it('after migration ends', async function () {
                    await ethers.provider.send('evm_setNextBlockTimestamp', [(await this.registryMigration.migrationEndTime()).toNumber() + 1]);
                    await ethers.provider.send('evm_mine');

                    expect(await this.scanners.isEnabled(nonMigrated)).to.equal(false);
                    expect(await this.scanners.isEnabled(migrated)).to.equal(false);

                    expect(
                        await this.scanners.getScanner(nonMigrated).then((scanner) => [scanner.registered, scanner.owner, scanner.chainId.toNumber(), scanner.metadata])
                    ).to.be.deep.equal([true, this.accounts.user1.address, chainId, `metadata-0`]);
                    expect(
                        await this.scanners
                            .getScannerState(nonMigrated)
                            .then((scanner) => [scanner.registered, scanner.owner, scanner.chainId.toNumber(), scanner.metadata, scanner.enabled, scanner.disabledFlags])
                    ).to.be.deep.equal([true, this.accounts.user1.address, chainId, `metadata-0`, false, BigNumber.from(0)]);
                    expect(
                        await this.scanners.getScanner(migrated).then((scanner) => [scanner.registered, scanner.owner, scanner.chainId.toNumber(), scanner.metadata])
                    ).to.be.deep.equal([true, this.accounts.user1.address, chainId, `migrated`]);
                    expect(
                        await this.scanners
                            .getScannerState(migrated)
                            .then((scanner) => [scanner.registered, scanner.owner, scanner.chainId.toNumber(), scanner.metadata, scanner.enabled, scanner.disabledFlags])
                    ).to.be.deep.equal([true, this.accounts.user1.address, chainId, `migrated`, false, BigNumber.from(1)]);
                });
            });
        });
    });
});
