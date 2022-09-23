const { ethers } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');
const { BigNumber } = require('@ethersproject/bignumber');

describe.only('Node Runner Registry', function () {
    prepare({ stake: { min: '100', max: '500', activated: true } });

    beforeEach(async function () {
        this.accounts.getAccount('scanner');
    });

    it.skip('isStakedOverMin false if scanner non existant', async function () {
        expect(await this.scanners.isStakedOverMin(this.accounts.scanner.address)).to.equal(false);
    });

    it('register node runner', async function () {
        await expect(this.nodeRunners.connect(this.accounts.user1).registerNodeRunner())
            .to.emit(this.nodeRunners, 'Transfer')
            .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, '1');
        expect(await this.nodeRunners.isRegistered(1)).to.be.equal(true);
        expect(await this.nodeRunners.ownerOf(1)).to.be.equal(this.accounts.user1.address);

        await expect(this.nodeRunners.connect(this.accounts.user2).registerNodeRunner())
            .to.emit(this.nodeRunners, 'Transfer')
            .withArgs(ethers.constants.AddressZero, this.accounts.user2.address, '2');
        expect(await this.nodeRunners.isRegistered(2)).to.be.equal(true);
        expect(await this.nodeRunners.ownerOf(2)).to.be.equal(this.accounts.user2.address);
    });

    it('register scanner', async function () {
        const SCANNER_ID = this.accounts.scanner.address;
        const SCANNER_ID_2 = this.accounts.user2.address;

        await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner();
        await expect(this.nodeRunners.connect(this.accounts.user1).registerScannerNode(1, SCANNER_ID, 1, 'metadata'))
            .to.emit(this.nodeRunners, 'ScannerUpdated')
            .withArgs(SCANNER_ID, 1, 'metadata', 1);
        await expect(this.nodeRunners.connect(this.accounts.user1).registerScannerNode(1, SCANNER_ID_2, 2, 'metadata2'))
            .to.emit(this.nodeRunners, 'ScannerUpdated')
            .withArgs(SCANNER_ID_2, 2, 'metadata2', 1);

        expect(await this.nodeRunners.getScanner(SCANNER_ID)).to.be.deep.equal([true, this.accounts.user1.address, BigNumber.from(1), 'metadata']);
        expect(await this.nodeRunners.isScannerRegistered(SCANNER_ID)).to.be.equal(true);
        expect(await this.nodeRunners.ownerOfScanner(SCANNER_ID)).to.be.equal(this.accounts.user1.address);
        expect(await this.nodeRunners.ownedScannerAddressAtIndex(1, 0)).to.be.equal(SCANNER_ID);

        expect(await this.nodeRunners.getScanner(SCANNER_ID_2)).to.be.deep.equal([true, this.accounts.user1.address, BigNumber.from(2), 'metadata2']);
        expect(await this.nodeRunners.isScannerRegistered(SCANNER_ID_2)).to.be.equal(true);
        expect(await this.nodeRunners.ownerOfScanner(SCANNER_ID_2)).to.be.equal(this.accounts.user1.address);
        expect(await this.nodeRunners.ownedScannerAddressAtIndex(1, 1)).to.be.equal(SCANNER_ID_2);

        expect(await this.nodeRunners.isScannerRegistered(this.accounts.user3.address)).to.be.equal(false);

        expect(await this.nodeRunners.totalScannersOwned(1)).to.be.equal(2);
    });

    it('register scanner - protected', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner();
        await this.nodeRunners.connect(this.accounts.user2).registerNodeRunner();
        await expect(this.nodeRunners.connect(this.accounts.user1).registerScannerNode(2, SCANNER_ID, 1, 'metadata')).to.be.revertedWith(
            `SenderNotOwner("${this.accounts.user1.address}", 2)`
        );
    });

    it.skip('public scanner register fails if stake not activated', async function () {
        await this.scanners.connect(this.accounts.manager).setStakeThreshold({ max: '100000', min: '0', activated: false }, 1);
        await expect(this.scanners.connect(this.accounts.scanner).register(this.accounts.user1.address, 1, 'metadata')).to.be.revertedWith('PublicRegistrationDisabled(1)');
    });

    it('scanner update', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner();
        await expect(this.nodeRunners.connect(this.accounts.user1).registerScannerNode(1, SCANNER_ID, 1, 'metadata'))
            .to.emit(this.nodeRunners, 'ScannerUpdated')
            .withArgs(SCANNER_ID, 1, 'metadata', 1);
        await expect(this.nodeRunners.connect(this.accounts.user1).updateScannerNode(1, SCANNER_ID, 33, '333'))
            .to.emit(this.nodeRunners, 'ScannerUpdated')
            .withArgs(SCANNER_ID, 33, '333', 1);

        expect(await this.nodeRunners.getScanner(SCANNER_ID)).to.be.deep.equal([true, this.accounts.user1.address, BigNumber.from(33), '333']);
        expect(await this.nodeRunners.isScannerRegistered(SCANNER_ID)).to.be.equal(true);
        expect(await this.nodeRunners.ownerOfScanner(SCANNER_ID)).to.be.equal(this.accounts.user1.address);
        expect(await this.nodeRunners.ownedScannerAddressAtIndex(1, 0)).to.be.equal(SCANNER_ID);
    });

    it('scanner update - non registered scanner', async function () {
        const SCANNER_ID = this.accounts.scanner.address;
        const WRONG_SCANNER_ID = this.accounts.admin.address;

        await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner();
        await expect(this.nodeRunners.connect(this.accounts.user1).registerScannerNode(1, SCANNER_ID, 1, 'metadata'))
            .to.emit(this.nodeRunners, 'ScannerUpdated')
            .withArgs(SCANNER_ID, 1, 'metadata', 1);
        await expect(this.nodeRunners.connect(this.accounts.user1).updateScannerNode(1, WRONG_SCANNER_ID, 33, '333')).to.be.revertedWith(
            `ScannerNotRegistered("${WRONG_SCANNER_ID}")`
        );
    });

    describe('managers', function () {
        beforeEach(async function () {
            await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner();

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

    describe('enable and disable', async function () {
        beforeEach(async function () {
            const SCANNER_ID = this.accounts.scanner.address;
            await expect(this.scanners.connect(this.accounts.scanner).register(this.accounts.user1.address, 1, 'metadata')).to.be.not.reverted;
            await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.SCANNER_SUBJECT_TYPE, SCANNER_ID, '100');
        });

        describe('manager', async function () {
            it.skip('disable', async function () {
                const SCANNER_ID = this.accounts.scanner.address;

                await expect(this.scanners.connect(this.accounts.manager).disableScanner(SCANNER_ID, 0))
                    .to.emit(this.scanners, 'ScannerEnabled')
                    .withArgs(SCANNER_ID, false, 0, false);

                expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(false);
            });

            it.skip('re-enable', async function () {
                const SCANNER_ID = this.accounts.scanner.address;

                await expect(this.scanners.connect(this.accounts.manager).disableScanner(SCANNER_ID, 0))
                    .to.emit(this.scanners, 'ScannerEnabled')
                    .withArgs(SCANNER_ID, false, 0, false);

                await expect(this.scanners.connect(this.accounts.manager).enableScanner(SCANNER_ID, 0))
                    .to.emit(this.scanners, 'ScannerEnabled')
                    .withArgs(SCANNER_ID, true, 0, true);

                expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(true);
            });

            it.skip('restricted', async function () {
                const SCANNER_ID = this.accounts.scanner.address;

                await expect(this.scanners.connect(this.accounts.other).disableScanner(SCANNER_ID, 0)).to.be.reverted;
            });
        });

        describe('self', async function () {
            it.skip('disable', async function () {
                const SCANNER_ID = this.accounts.scanner.address;

                await expect(this.scanners.connect(this.accounts.scanner).disableScanner(SCANNER_ID, 1))
                    .to.emit(this.scanners, 'ScannerEnabled')
                    .withArgs(SCANNER_ID, false, 1, false);

                expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(false);
            });

            it.skip('re-enable', async function () {
                const SCANNER_ID = this.accounts.scanner.address;

                await expect(this.scanners.connect(this.accounts.scanner).disableScanner(SCANNER_ID, 1))
                    .to.emit(this.scanners, 'ScannerEnabled')
                    .withArgs(SCANNER_ID, false, 1, false);

                await expect(this.scanners.connect(this.accounts.scanner).enableScanner(SCANNER_ID, 1))
                    .to.emit(this.scanners, 'ScannerEnabled')
                    .withArgs(SCANNER_ID, true, 1, true);

                expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(true);
            });

            it.skip('restricted', async function () {
                const SCANNER_ID = this.accounts.scanner.address;

                await expect(this.scanners.connect(this.accounts.other).disableScanner(SCANNER_ID, 1)).to.be.reverted;
            });
        });

        describe('node runner', async function () {
            it.skip('disable', async function () {
                const SCANNER_ID = this.accounts.scanner.address;

                await expect(this.scanners.connect(this.accounts.user1).disableScanner(SCANNER_ID, 2))
                    .to.emit(this.scanners, 'ScannerEnabled')
                    .withArgs(SCANNER_ID, false, 2, false);

                expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(false);
            });

            it.skip('re-enable', async function () {
                const SCANNER_ID = this.accounts.scanner.address;

                await expect(this.scanners.connect(this.accounts.user1).disableScanner(SCANNER_ID, 2))
                    .to.emit(this.scanners, 'ScannerEnabled')
                    .withArgs(SCANNER_ID, false, 2, false);

                await expect(this.scanners.connect(this.accounts.user1).enableScanner(SCANNER_ID, 2)).to.emit(this.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, true, 2, true);

                expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(true);
            });

            it.skip('restricted', async function () {
                const SCANNER_ID = this.accounts.scanner.address;

                await expect(this.scanners.connect(this.accounts.other).disableScanner(SCANNER_ID, 2)).to.be.reverted;
            });
        });

        describe('stake', async function () {
            it.skip('re-enable', async function () {
                const SCANNER_ID = this.accounts.scanner.address;

                await expect(this.scanners.connect(this.accounts.scanner).disableScanner(SCANNER_ID, 1))
                    .to.emit(this.scanners, 'ScannerEnabled')
                    .withArgs(SCANNER_ID, false, 1, false);

                await expect(this.scanners.connect(this.accounts.scanner).enableScanner(SCANNER_ID, 1))
                    .to.emit(this.scanners, 'ScannerEnabled')
                    .withArgs(SCANNER_ID, true, 1, true);

                expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(true);
            });

            it.skip('cannot enable if staked under minimum', async function () {
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

            it.skip('isEnabled reacts to stake changes', async function () {
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
