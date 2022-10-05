const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');

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

        it.only('should not burn ScannerNodeRegistry without NODE_RUNNER_MIGRATOR_ROLE', async function () {
            await expect(this.scanners.connect(this.accounts.user1).deregisterScannerNode(SCANNERS[0].address)).to.be.revertedWith(
                `MissingRole("${this.roles.NODE_RUNNER_MIGRATOR_ROLE}", "${this.accounts.user1.address}")`
            );
        });

        it.only('should not burn ScannerNodeRegistry if it doesnt exist', async function () {
            await expect(this.scanners.connect(this.accounts.manager).deregisterScannerNode(this.accounts.admin.address)).to.be.revertedWith('lol');
        });

        describe('migrate scanners - priviledge path', function () {
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
                await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner();
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
    });

    describe.skip('enable and disable', async function () {
        beforeEach(async function () {
            const SCANNER_ID = this.accounts.scanner.address;
            await expect(this.scanners.connect(this.accounts.scanner).register(this.accounts.user1.address, 1, 'metadata')).to.be.not.reverted;
            await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.SCANNER_SUBJECT_TYPE, SCANNER_ID, '100');
        });

        describe('manager', async function () {
            it('disable', async function () {
                const SCANNER_ID = this.accounts.scanner.address;

                await expect(this.scanners.connect(this.accounts.manager).disableScanner(SCANNER_ID, 0))
                    .to.emit(this.scanners, 'ScannerEnabled')
                    .withArgs(SCANNER_ID, false, 0, false);

                expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(false);
            });

            it('re-enable', async function () {
                const SCANNER_ID = this.accounts.scanner.address;

                await expect(this.scanners.connect(this.accounts.manager).disableScanner(SCANNER_ID, 0))
                    .to.emit(this.scanners, 'ScannerEnabled')
                    .withArgs(SCANNER_ID, false, 0, false);

                await expect(this.scanners.connect(this.accounts.manager).enableScanner(SCANNER_ID, 0))
                    .to.emit(this.scanners, 'ScannerEnabled')
                    .withArgs(SCANNER_ID, true, 0, true);

                expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(true);
            });

            it('restricted', async function () {
                const SCANNER_ID = this.accounts.scanner.address;

                await expect(this.scanners.connect(this.accounts.other).disableScanner(SCANNER_ID, 0)).to.be.reverted;
            });
        });

        describe('self', async function () {
            it('disable', async function () {
                const SCANNER_ID = this.accounts.scanner.address;

                await expect(this.scanners.connect(this.accounts.scanner).disableScanner(SCANNER_ID, 1))
                    .to.emit(this.scanners, 'ScannerEnabled')
                    .withArgs(SCANNER_ID, false, 1, false);

                expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(false);
            });

            it('re-enable', async function () {
                const SCANNER_ID = this.accounts.scanner.address;

                await expect(this.scanners.connect(this.accounts.scanner).disableScanner(SCANNER_ID, 1))
                    .to.emit(this.scanners, 'ScannerEnabled')
                    .withArgs(SCANNER_ID, false, 1, false);

                await expect(this.scanners.connect(this.accounts.scanner).enableScanner(SCANNER_ID, 1))
                    .to.emit(this.scanners, 'ScannerEnabled')
                    .withArgs(SCANNER_ID, true, 1, true);

                expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(true);
            });

            it('restricted', async function () {
                const SCANNER_ID = this.accounts.scanner.address;

                await expect(this.scanners.connect(this.accounts.other).disableScanner(SCANNER_ID, 1)).to.be.reverted;
            });
        });

        describe('owner', async function () {
            it('disable', async function () {
                const SCANNER_ID = this.accounts.scanner.address;

                await expect(this.scanners.connect(this.accounts.user1).disableScanner(SCANNER_ID, 2))
                    .to.emit(this.scanners, 'ScannerEnabled')
                    .withArgs(SCANNER_ID, false, 2, false);

                expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(false);
            });

            it('re-enable', async function () {
                const SCANNER_ID = this.accounts.scanner.address;

                await expect(this.scanners.connect(this.accounts.user1).disableScanner(SCANNER_ID, 2))
                    .to.emit(this.scanners, 'ScannerEnabled')
                    .withArgs(SCANNER_ID, false, 2, false);

                await expect(this.scanners.connect(this.accounts.user1).enableScanner(SCANNER_ID, 2)).to.emit(this.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, true, 2, true);

                expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(true);
            });

            it('restricted', async function () {
                const SCANNER_ID = this.accounts.scanner.address;

                await expect(this.scanners.connect(this.accounts.other).disableScanner(SCANNER_ID, 2)).to.be.reverted;
            });
        });

        describe('manager', async function () {
            beforeEach(async function () {
                await expect(this.scanners.connect(this.accounts.user1).setManager(this.accounts.scanner.address, this.accounts.user2.address, true)).to.be.not.reverted;
            });

            it('disable', async function () {
                const SCANNER_ID = this.accounts.scanner.address;

                await expect(this.scanners.connect(this.accounts.user2).disableScanner(SCANNER_ID, 3))
                    .to.emit(this.scanners, 'ScannerEnabled')
                    .withArgs(SCANNER_ID, false, 3, false);

                expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(false);
            });

            it('re-enable', async function () {
                const SCANNER_ID = this.accounts.scanner.address;

                await expect(this.scanners.connect(this.accounts.user2).disableScanner(SCANNER_ID, 3))
                    .to.emit(this.scanners, 'ScannerEnabled')
                    .withArgs(SCANNER_ID, false, 3, false);

                await expect(this.scanners.connect(this.accounts.user2).enableScanner(SCANNER_ID, 3)).to.emit(this.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, true, 3, true);

                expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(true);
            });

            it('restricted', async function () {
                const SCANNER_ID = this.accounts.scanner.address;

                await expect(this.scanners.connect(this.accounts.other).disableScanner(SCANNER_ID, 3)).to.be.reverted;
            });
        });

        describe('stake', async function () {
            it('re-enable', async function () {
                const SCANNER_ID = this.accounts.scanner.address;

                await expect(this.scanners.connect(this.accounts.scanner).disableScanner(SCANNER_ID, 1))
                    .to.emit(this.scanners, 'ScannerEnabled')
                    .withArgs(SCANNER_ID, false, 1, false);

                await expect(this.scanners.connect(this.accounts.scanner).enableScanner(SCANNER_ID, 1))
                    .to.emit(this.scanners, 'ScannerEnabled')
                    .withArgs(SCANNER_ID, true, 1, true);

                expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(true);
            });

            it('cannot enable if staked under minimum', async function () {
                const SCANNER_ID = this.accounts.scanner.address;
                const SCANNER_SUBJECT_ID = ethers.BigNumber.from(SCANNER_ID);
                await expect(this.scanners.connect(this.accounts.scanner).disableScanner(SCANNER_ID, 1))
                    .to.emit(this.scanners, 'ScannerEnabled')
                    .withArgs(SCANNER_ID, false, 1, false);
                await this.scanners.connect(this.accounts.manager).setStakeThreshold({ max: '100000', min: '10000', activated: true }, 1);
                await expect(this.scanners.connect(this.accounts.scanner).enableScanner(SCANNER_ID, 1)).to.be.revertedWith(
                    `StakedUnderMinimum(${ethers.BigNumber.from(SCANNER_ID).toString()})`
                );
                await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.SCANNER_SUBJECT_TYPE, SCANNER_SUBJECT_ID, '10000');
                await expect(this.scanners.connect(this.accounts.scanner).enableScanner(SCANNER_ID, 1))
                    .to.emit(this.scanners, 'ScannerEnabled')
                    .withArgs(SCANNER_ID, true, 1, true);
                expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(true);
            });

            it('isEnabled reacts to stake changes', async function () {
                const SCANNER_ID = this.accounts.scanner.address;
                const SCANNER_SUBJECT_ID = ethers.BigNumber.from(SCANNER_ID);
                expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(true);
                await this.scanners.connect(this.accounts.manager).setStakeThreshold({ max: '100000', min: '10000', activated: true }, 1);
                expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(false);
                await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.SCANNER_SUBJECT_TYPE, SCANNER_SUBJECT_ID, '10000');
                expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(true);
            });
        });
    });
});
