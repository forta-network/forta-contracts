const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');
const { prepare } = require('../fixture');
const { BigNumber } = require('@ethersproject/bignumber');
const { signERC712ScannerRegistration } = require('../../scripts/utils/scannerRegistration');

let SCANNER_ADDRESS_1, scanner1Registration, scanner1Signature, verifyingContractInfo;
describe('Node Runner Registry', function () {
    // TODO Stake related stuff
    prepare({ stake: { scanners: { min: '100', max: '500', activated: true } } });

    beforeEach(async function () {
        const network = await ethers.provider.getNetwork();
        this.accounts.getAccount('scanner');

        SCANNER_ADDRESS_1 = this.accounts.scanner.address;
        verifyingContractInfo = {
            address: this.contracts.nodeRunners.address,
            chainId: network.chainId,
        };
        scanner1Registration = {
            scanner: SCANNER_ADDRESS_1,
            nodeRunnerId: 1,
            chainId: 1,
            metadata: 'metadata',
            timestamp: (await ethers.provider.getBlock('latest')).timestamp,
        };

        scanner1Signature = await signERC712ScannerRegistration(verifyingContractInfo, scanner1Registration, this.accounts.scanner);
    });

    it('register node runner', async function () {
        await expect(this.nodeRunners.connect(this.accounts.user1).registerNodeRunner(1))
            .to.emit(this.nodeRunners, 'Transfer')
            .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, '1')
            .to.emit(this.nodeRunners, 'NodeRunnerRegistered')
            .withArgs(1, 1);
        expect(await this.nodeRunners.isRegistered(1)).to.be.equal(true);
        expect(await this.nodeRunners.ownerOf(1)).to.be.equal(this.accounts.user1.address);
        expect(await this.nodeRunners.monitoredChainId(1)).to.be.equal(1);

        await expect(this.nodeRunners.connect(this.accounts.user2).registerNodeRunner(44))
            .to.emit(this.nodeRunners, 'Transfer')
            .withArgs(ethers.constants.AddressZero, this.accounts.user2.address, '2')
            .to.emit(this.nodeRunners, 'NodeRunnerRegistered')
            .withArgs(2, 44);
        expect(await this.nodeRunners.isRegistered(2)).to.be.equal(true);
        expect(await this.nodeRunners.ownerOf(2)).to.be.equal(this.accounts.user2.address);
        expect(await this.nodeRunners.monitoredChainId(2)).to.be.equal(44);
    });

    it('register scanner', async function () {
        const SCANNER_ADDRESS = this.accounts.scanner.address;
        const SCANNER_ADDRESS_2 = this.accounts.user2.address;

        await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner(1);
        await expect(this.nodeRunners.connect(this.accounts.user1).registerScannerNode(scanner1Registration, scanner1Signature))
            .to.emit(this.nodeRunners, 'ScannerUpdated')
            .withArgs(SCANNER_ADDRESS, 1, 'metadata', 1);
        const scanner2Registration = {
            scanner: SCANNER_ADDRESS_2,
            nodeRunnerId: 1,
            chainId: 1,
            metadata: 'metadata2',
            timestamp: (await ethers.provider.getBlock('latest')).timestamp,
        };
        const scanner2Signature = await signERC712ScannerRegistration(verifyingContractInfo, scanner2Registration, this.accounts.user2);
        await expect(this.nodeRunners.connect(this.accounts.user1).registerScannerNode(scanner2Registration, scanner2Signature))
            .to.emit(this.nodeRunners, 'ScannerUpdated')
            .withArgs(SCANNER_ADDRESS_2, 1, 'metadata2', 1);

        expect(await this.nodeRunners.getScanner(SCANNER_ADDRESS)).to.be.deep.equal([true, false, BigNumber.from(1), BigNumber.from(1), 'metadata']);

        expect(await this.nodeRunners.isScannerRegistered(SCANNER_ADDRESS)).to.be.equal(true);
        expect(await this.nodeRunners.registeredScannerAddressAtIndex(1, 0)).to.be.equal(SCANNER_ADDRESS);

        expect(await this.nodeRunners.getScanner(SCANNER_ADDRESS_2)).to.be.deep.equal([true, false, BigNumber.from(1), BigNumber.from(1), 'metadata2']);
        expect(await this.nodeRunners.isScannerRegistered(SCANNER_ADDRESS_2)).to.be.equal(true);
        expect(await this.nodeRunners.registeredScannerAddressAtIndex(1, 1)).to.be.equal(SCANNER_ADDRESS_2);

        expect(await this.nodeRunners.isScannerRegistered(this.accounts.user3.address)).to.be.equal(false);

        expect(await this.nodeRunners.totalScannersRegistered(1)).to.be.equal(2);
    });

    describe('migration', function () {
        beforeEach(async function () {
            await this.access.connect(this.accounts.admin).grantRole(this.roles.SCANNER_2_NODE_RUNNER_MIGRATOR, this.accounts.manager.address);
        });

        it('migrate node runner', async function () {
            await expect(this.nodeRunners.connect(this.accounts.manager).registerMigratedNodeRunner(this.accounts.user1.address, 1))
                .to.emit(this.nodeRunners, 'Transfer')
                .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, '1');
            expect(await this.nodeRunners.isRegistered(1)).to.be.equal(true);
            expect(await this.nodeRunners.ownerOf(1)).to.be.equal(this.accounts.user1.address);
        });

        it('should not migrate node runner if not SCANNER_2_NODE_RUNNER_MIGRATOR_ROLE ', async function () {
            await expect(this.nodeRunners.connect(this.accounts.user1).registerMigratedNodeRunner(this.accounts.user1.address, 1)).to.be.revertedWith(
                `MissingRole("${this.roles.SCANNER_2_NODE_RUNNER_MIGRATOR}", "${this.accounts.user1.address}")`
            );
        });

        it('migrate scanner', async function () {
            const SCANNER_ADDRESS = this.accounts.scanner.address;
            await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner(1);
            await expect(this.nodeRunners.connect(this.accounts.manager).registerMigratedScannerNode(scanner1Registration, true))
                .to.emit(this.nodeRunners, 'ScannerUpdated')
                .withArgs(SCANNER_ADDRESS, 1, 'metadata', 1);
            expect(await this.nodeRunners.getScanner(SCANNER_ADDRESS)).to.be.deep.equal([true, true, BigNumber.from(1), BigNumber.from(1), 'metadata']);
            expect(await this.nodeRunners.isScannerRegistered(SCANNER_ADDRESS)).to.be.equal(true);
            expect(await this.nodeRunners.registeredScannerAddressAtIndex(1, 0)).to.be.equal(SCANNER_ADDRESS);
            expect(await this.nodeRunners.totalScannersRegistered(1)).to.be.equal(1);
        });

        it('should not migrate scanner if not SCANNER_2_NODE_RUNNER_MIGRATOR_ROLE', async function () {
            await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner(1);
            await expect(this.nodeRunners.connect(this.accounts.user1).registerMigratedScannerNode(scanner1Registration, false)).to.be.revertedWith(
                `MissingRole("${this.roles.SCANNER_2_NODE_RUNNER_MIGRATOR}", "${this.accounts.user1.address}")`
            );
        });
    });

    it('should not register scanner after delay', async function () {
        await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner(1);
        const scanner2Registration = {
            scanner: this.accounts.user2.address,
            nodeRunnerId: 1,
            chainId: 1,
            metadata: 'metadata2',
            timestamp: (await ethers.provider.getBlock('latest')).timestamp,
        };
        const scanner2Signature = await signERC712ScannerRegistration(verifyingContractInfo, scanner2Registration, this.accounts.user2);
        const delay = (await this.contracts.nodeRunners.registrationDelay()).toNumber();
        console.log(delay);
        await hre.network.provider.send('evm_increaseTime', [delay + 1000]);
        await expect(this.nodeRunners.connect(this.accounts.user1).registerScannerNode(scanner2Registration, scanner2Signature)).to.be.revertedWith('RegisteringTooLate');
    });

    it('should not register scanner signed by other', async function () {
        await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner(2);
        const scanner2Registration = {
            scanner: this.accounts.user2.address,
            nodeRunnerId: 1,
            chainId: 2,
            metadata: 'metadata2',
            timestamp: (await ethers.provider.getBlock('latest')).timestamp,
        };
        const scanner2Signature = await signERC712ScannerRegistration(verifyingContractInfo, scanner2Registration, this.accounts.user3);
        await expect(this.nodeRunners.connect(this.accounts.user1).registerScannerNode(scanner2Registration, scanner2Signature)).to.be.revertedWith('SignatureDoesNotMatch');
    });

    it('should not register scanner if not owner', async function () {
        await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner(2);
        const scanner2Registration = {
            scanner: this.accounts.user2.address,
            nodeRunnerId: 1,
            chainId: 2,
            metadata: 'metadata2',
            timestamp: (await ethers.provider.getBlock('latest')).timestamp,
        };
        const scanner2Signature = await signERC712ScannerRegistration(verifyingContractInfo, scanner2Registration, this.accounts.user2);
        await expect(this.nodeRunners.connect(this.accounts.user2).registerScannerNode(scanner2Registration, scanner2Signature)).to.be.revertedWith(
            `SenderNotNodeRunner("${this.accounts.user2.address}", 1)`
        );
    });

    it('should not register scanner if not same chain', async function () {
        await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner(1);
        const scanner2Registration = {
            scanner: this.accounts.user2.address,
            nodeRunnerId: 1,
            chainId: 2,
            metadata: 'metadata2',
            timestamp: (await ethers.provider.getBlock('latest')).timestamp,
        };
        const scanner2Signature = await signERC712ScannerRegistration(verifyingContractInfo, scanner2Registration, this.accounts.user2);
        await expect(this.nodeRunners.connect(this.accounts.user1).registerScannerNode(scanner2Registration, scanner2Signature)).to.be.revertedWith(`ChainIdMismatch(1, 2)`);
    });

    it('should not register scanner if already registered', async function () {
        const SCANNER_ADDRESS = this.accounts.scanner.address;

        await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner(1);
        await expect(this.nodeRunners.connect(this.accounts.user1).registerScannerNode(scanner1Registration, scanner1Signature))
            .to.emit(this.nodeRunners, 'ScannerUpdated')
            .withArgs(SCANNER_ADDRESS, 1, 'metadata', 1);
        const scanner2Registration = {
            scanner: SCANNER_ADDRESS,
            nodeRunnerId: 1,
            chainId: 1,
            metadata: 'metadata2',
            timestamp: (await ethers.provider.getBlock('latest')).timestamp,
        };
        const scanner2Signature = await signERC712ScannerRegistration(verifyingContractInfo, scanner2Registration, this.accounts.scanner);
        await expect(this.nodeRunners.connect(this.accounts.user1).registerScannerNode(scanner2Registration, scanner2Signature)).to.be.revertedWith('ScannerExists');
    });

    it('scanner metadata update', async function () {
        const SCANNER_ADDRESS = this.accounts.scanner.address;

        await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner(1);
        await this.nodeRunners.connect(this.accounts.user1).registerScannerNode(scanner1Registration, scanner1Signature);
        await expect(this.nodeRunners.connect(this.accounts.user1).updateScannerMetadata(SCANNER_ADDRESS, '333'))
            .to.emit(this.nodeRunners, 'ScannerUpdated')
            .withArgs(SCANNER_ADDRESS, 1, '333', 1);
        expect(await this.nodeRunners.getScanner(SCANNER_ADDRESS)).to.be.deep.equal([true, false, BigNumber.from(1), BigNumber.from(1), '333']);
        expect(await this.nodeRunners.isScannerRegistered(SCANNER_ADDRESS)).to.be.equal(true);
        expect(await this.nodeRunners.registeredScannerAddressAtIndex(1, 0)).to.be.equal(SCANNER_ADDRESS);
    });

    it('scanner metadata update - non registered scanner', async function () {
        const WRONG_SCANNER_ADDRESS = this.accounts.admin.address;

        await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner(1);
        await this.nodeRunners.connect(this.accounts.user1).registerScannerNode(scanner1Registration, scanner1Signature);

        await expect(this.nodeRunners.connect(this.accounts.user1).updateScannerMetadata(WRONG_SCANNER_ADDRESS, '333')).to.be.revertedWith(
            `ScannerNotRegistered("${WRONG_SCANNER_ADDRESS}")`
        );
    });

    describe('managers', function () {
        beforeEach(async function () {
            await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner(1);
        });

        it('add manager', async function () {
            const NODE_RUNNER_ID = 1;
            expect(await this.nodeRunners.isManager(NODE_RUNNER_ID, this.accounts.user1.address)).to.be.equal(false);
            expect(await this.nodeRunners.isManager(NODE_RUNNER_ID, this.accounts.user2.address)).to.be.equal(false);
            expect(await this.nodeRunners.isManager(NODE_RUNNER_ID, this.accounts.user3.address)).to.be.equal(false);
            expect(await this.nodeRunners.getManagerCount(NODE_RUNNER_ID)).to.be.equal(0);

            await expect(this.nodeRunners.connect(this.accounts.user1).setManager(NODE_RUNNER_ID, this.accounts.user2.address, true))
                .to.emit(this.nodeRunners, 'ManagerEnabled')
                .withArgs(NODE_RUNNER_ID, this.accounts.user2.address, true);

            expect(await this.nodeRunners.isManager(NODE_RUNNER_ID, this.accounts.user1.address)).to.be.equal(false);
            expect(await this.nodeRunners.isManager(NODE_RUNNER_ID, this.accounts.user2.address)).to.be.equal(true);
            expect(await this.nodeRunners.isManager(NODE_RUNNER_ID, this.accounts.user3.address)).to.be.equal(false);
            expect(await this.nodeRunners.getManagerCount(NODE_RUNNER_ID)).to.be.equal(1);
            expect(await this.nodeRunners.getManagerAt(NODE_RUNNER_ID, 0)).to.be.equal(this.accounts.user2.address);
        });

        it('remove manager', async function () {
            const NODE_RUNNER_ID = 1;
            expect(await this.nodeRunners.isManager(NODE_RUNNER_ID, this.accounts.user1.address)).to.be.equal(false);
            expect(await this.nodeRunners.isManager(NODE_RUNNER_ID, this.accounts.user2.address)).to.be.equal(false);
            expect(await this.nodeRunners.isManager(NODE_RUNNER_ID, this.accounts.user3.address)).to.be.equal(false);
            expect(await this.nodeRunners.getManagerCount(NODE_RUNNER_ID)).to.be.equal(0);

            await expect(this.nodeRunners.connect(this.accounts.user1).setManager(NODE_RUNNER_ID, this.accounts.user2.address, true))
                .to.emit(this.nodeRunners, 'ManagerEnabled')
                .withArgs(NODE_RUNNER_ID, this.accounts.user2.address, true);
            await expect(this.nodeRunners.connect(this.accounts.user1).setManager(NODE_RUNNER_ID, this.accounts.user3.address, true))
                .to.emit(this.nodeRunners, 'ManagerEnabled')
                .withArgs(NODE_RUNNER_ID, this.accounts.user3.address, true);

            expect(await this.nodeRunners.isManager(NODE_RUNNER_ID, this.accounts.user1.address)).to.be.equal(false);
            expect(await this.nodeRunners.isManager(NODE_RUNNER_ID, this.accounts.user2.address)).to.be.equal(true);
            expect(await this.nodeRunners.isManager(NODE_RUNNER_ID, this.accounts.user3.address)).to.be.equal(true);
            expect(await this.nodeRunners.getManagerCount(NODE_RUNNER_ID)).to.be.equal(2);
            expect(await this.nodeRunners.getManagerAt(NODE_RUNNER_ID, 0)).to.be.equal(this.accounts.user2.address);
            expect(await this.nodeRunners.getManagerAt(NODE_RUNNER_ID, 1)).to.be.equal(this.accounts.user3.address);

            await expect(this.nodeRunners.connect(this.accounts.user1).setManager(NODE_RUNNER_ID, this.accounts.user2.address, false))
                .to.emit(this.nodeRunners, 'ManagerEnabled')
                .withArgs(NODE_RUNNER_ID, this.accounts.user2.address, false);

            expect(await this.nodeRunners.isManager(NODE_RUNNER_ID, this.accounts.user1.address)).to.be.equal(false);
            expect(await this.nodeRunners.isManager(NODE_RUNNER_ID, this.accounts.user2.address)).to.be.equal(false);
            expect(await this.nodeRunners.isManager(NODE_RUNNER_ID, this.accounts.user3.address)).to.be.equal(true);
            expect(await this.nodeRunners.getManagerCount(NODE_RUNNER_ID)).to.be.equal(1);
            expect(await this.nodeRunners.getManagerAt(NODE_RUNNER_ID, 0)).to.be.equal(this.accounts.user3.address);
        });
    });

    describe.skip('enable and disable', async function () {
        beforeEach(async function () {
            await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner();
            await this.nodeRunners.connect(this.accounts.user1).registerScannerNode(scanner1Registration, scanner1Signature);
            // await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.SCANNER, SCANNER_ADDRESS, '100');
        });

        describe('manager', async function () {
            beforeEach(async function () {
                await this.nodeRunners.connect(this.accounts.user1).setManager(1, this.accounts.manager.address, true);
            });

            it('disable', async function () {
                const SCANNER_ADDRESS = this.accounts.scanner.address;

                await expect(this.nodeRunners.connect(this.accounts.manager).disableScanner(SCANNER_ADDRESS))
                    .to.emit(this.nodeRunners, 'ScannerEnabled')
                    .withArgs(SCANNER_ADDRESS, false, this.accounts.manager.address, true);

                expect(await this.nodeRunners.isScannerOperational(SCANNER_ADDRESS)).to.be.equal(false);
            });

            it('re-enable', async function () {
                const SCANNER_ADDRESS = this.accounts.scanner.address;

                await expect(this.nodeRunners.connect(this.accounts.manager).disableScanner(SCANNER_ADDRESS))
                    .to.emit(this.nodeRunners, 'ScannerEnabled')
                    .withArgs(SCANNER_ADDRESS, false, this.accounts.manager.address, true);

                await expect(this.nodeRunners.connect(this.accounts.manager).enableScanner(SCANNER_ADDRESS))
                    .to.emit(this.nodeRunners, 'ScannerEnabled')
                    .withArgs(SCANNER_ADDRESS, true, this.accounts.manager.address, false);

                expect(await this.nodeRunners.isScannerOperational(SCANNER_ADDRESS)).to.be.equal(true);
            });

            it('restricted', async function () {
                const SCANNER_ADDRESS = this.accounts.scanner.address;

                await expect(this.nodeRunners.connect(this.accounts.other).disableScanner(SCANNER_ADDRESS)).to.be.reverted;
            });
        });

        describe('self', async function () {
            it('disable', async function () {
                const SCANNER_ADDRESS = this.accounts.scanner.address;

                await expect(this.nodeRunners.connect(this.accounts.scanner).disableScanner(SCANNER_ADDRESS))
                    .to.emit(this.nodeRunners, 'ScannerEnabled')
                    .withArgs(SCANNER_ADDRESS, false, SCANNER_ADDRESS, true);

                expect(await this.nodeRunners.isScannerOperational(SCANNER_ADDRESS)).to.be.equal(false);
            });

            it('re-enable', async function () {
                const SCANNER_ADDRESS = this.accounts.scanner.address;

                await expect(this.nodeRunners.connect(this.accounts.scanner).disableScanner(SCANNER_ADDRESS))
                    .to.emit(this.nodeRunners, 'ScannerEnabled')
                    .withArgs(SCANNER_ADDRESS, false, SCANNER_ADDRESS, true);

                await expect(this.nodeRunners.connect(this.accounts.scanner).enableScanner(SCANNER_ADDRESS))
                    .to.emit(this.nodeRunners, 'ScannerEnabled')
                    .withArgs(SCANNER_ADDRESS, true, SCANNER_ADDRESS, false);

                expect(await this.nodeRunners.isScannerOperational(SCANNER_ADDRESS)).to.be.equal(true);
            });

            it('restricted', async function () {
                const SCANNER_ADDRESS = this.accounts.scanner.address;

                await expect(this.nodeRunners.connect(this.accounts.other).disableScanner(SCANNER_ADDRESS)).to.be.reverted;
            });
        });

        describe('node runner', async function () {
            it('disable', async function () {
                const SCANNER_ADDRESS = this.accounts.scanner.address;

                await expect(this.nodeRunners.connect(this.accounts.user1).disableScanner(SCANNER_ADDRESS))
                    .to.emit(this.nodeRunners, 'ScannerEnabled')
                    .withArgs(SCANNER_ADDRESS, false, this.accounts.user1.address, true);

                expect(await this.nodeRunners.isScannerOperational(SCANNER_ADDRESS)).to.be.equal(false);
            });

            it('re-enable', async function () {
                const SCANNER_ADDRESS = this.accounts.scanner.address;

                await expect(this.nodeRunners.connect(this.accounts.user1).disableScanner(SCANNER_ADDRESS))
                    .to.emit(this.nodeRunners, 'ScannerEnabled')
                    .withArgs(SCANNER_ADDRESS, false, this.accounts.user1.address, true);

                await expect(this.nodeRunners.connect(this.accounts.user1).enableScanner(SCANNER_ADDRESS))
                    .to.emit(this.nodeRunners, 'ScannerEnabled')
                    .withArgs(SCANNER_ADDRESS, true, this.accounts.user1.address, false);

                expect(await this.nodeRunners.isScannerOperational(SCANNER_ADDRESS)).to.be.equal(true);
            });

            it('restricted', async function () {
                const SCANNER_ADDRESS = this.accounts.scanner.address;

                await expect(this.nodeRunners.connect(this.accounts.other).disableScanner(SCANNER_ADDRESS)).to.be.reverted;
            });
        });

        describe('stake', async function () {
            it.skip('re-enable', async function () {
                const SCANNER_ADDRESS = this.accounts.scanner.address;

                await expect(this.nodeRunners.connect(this.accounts.scanner).disableScanner(SCANNER_ADDRESS))
                    .to.emit(this.nodeRunners, 'ScannerEnabled')
                    .withArgs(SCANNER_ADDRESS, false, 1, true);

                await expect(this.nodeRunners.connect(this.accounts.scanner).enableScanner(SCANNER_ADDRESS))
                    .to.emit(this.nodeRunners, 'ScannerEnabled')
                    .withArgs(SCANNER_ADDRESS, true, 1, false);

                expect(await this.nodeRunners.isScannerOperational(SCANNER_ADDRESS)).to.be.equal(true);
            });
            it.skip('isScannerOperational reacts to stake changes', async function () {
                const SCANNER_ADDRESS = this.accounts.scanner.address;
                const SCANNER_SUBJECT_ID = ethers.BigNumber.from(SCANNER_ADDRESS);
                expect(await this.nodeRunners.isScannerOperational(SCANNER_ADDRESS)).to.be.equal(true);
                await this.nodeRunners.connect(this.accounts.manager).setStakeThreshold({ max: '100000', min: '10000', activated: true }, 1);
                expect(await this.nodeRunners.isScannerOperational(SCANNER_ADDRESS)).to.be.equal(false);
                await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.SCANNER, SCANNER_SUBJECT_ID, '10000');
                expect(await this.nodeRunners.isScannerOperational(SCANNER_ADDRESS)).to.be.equal(true);
            });
        });
    });
});
