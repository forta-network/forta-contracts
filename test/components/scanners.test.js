const { ethers } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');
const { BigNumber } = require('@ethersproject/bignumber');

describe('Scanner Registry', function () {
    prepare({ stake: { min: '100', max: '500', activated: true } });

    beforeEach(async function () {
        this.accounts.getAccount('scanner');
    });

    it('isStakedOverMin false if non existant', async function () {
        expect(await this.scanners.isStakedOverMin(this.accounts.scanner.address)).to.equal(false);
    });

    it('register', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.scanners.connect(this.accounts.scanner).register(this.accounts.user1.address, 1, 'metadata'))
            .to.emit(this.scanners, 'Transfer')
            .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, SCANNER_ID)
            .to.emit(this.scanners, 'ScannerUpdated')
            .withArgs(SCANNER_ID, 1, 'metadata');

        expect(await this.scanners.getScanner(SCANNER_ID)).to.be.deep.equal([true, this.accounts.user1.address, BigNumber.from(1), 'metadata']);
        expect(await this.scanners.isRegistered(SCANNER_ID)).to.be.equal(true);
        expect(await this.scanners.ownerOf(SCANNER_ID)).to.be.equal(this.accounts.user1.address);
    });

    it('public register fails if stake not activated', async function () {
        await this.scanners.connect(this.accounts.manager).setStakeThreshold({ max: '100000', min: '0', activated: false }, 1);
        await expect(this.scanners.connect(this.accounts.scanner).register(this.accounts.user1.address, 1, 'metadata')).to.be.revertedWith('PublicRegistrationDisabled(1)');
    });

    it('admin register', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.scanners.connect(this.accounts.manager).adminRegister(SCANNER_ID, this.accounts.user1.address, 1, 'metadata'))
            .to.emit(this.scanners, 'Transfer')
            .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, SCANNER_ID)
            .to.emit(this.scanners, 'ScannerUpdated')
            .withArgs(SCANNER_ID, 1, 'metadata');

        expect(await this.scanners.getScanner(SCANNER_ID)).to.be.deep.equal([true, this.accounts.user1.address, BigNumber.from(1), 'metadata']);

        expect(await this.scanners.ownerOf(SCANNER_ID)).to.be.equal(this.accounts.user1.address);
    });

    it('admin register - protected', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.scanners.connect(this.accounts.user1).adminRegister(SCANNER_ID, this.accounts.user1.address, 1, 'metadata')).to.be.revertedWith(
            `MissingRole("${this.roles.SCANNER_ADMIN}", "${this.accounts.user1.address}")`
        );
    });

    it('admin update', async function () {
        const SCANNER_ID = this.accounts.scanner.address;
        await this.scanners.connect(this.accounts.manager).adminRegister(SCANNER_ID, this.accounts.user1.address, 1, 'metadata');

        await expect(this.scanners.connect(this.accounts.manager).adminUpdate(SCANNER_ID, 55, 'metadata2'))
            .to.emit(this.scanners, 'ScannerUpdated')
            .withArgs(SCANNER_ID, 55, 'metadata2');

        expect(await this.scanners.getScanner(SCANNER_ID)).to.be.deep.equal([true, this.accounts.user1.address, BigNumber.from(55), 'metadata2']);

        expect(await this.scanners.ownerOf(SCANNER_ID)).to.be.equal(this.accounts.user1.address);
    });

    it('admin update - protected', async function () {
        const SCANNER_ID = this.accounts.scanner.address;
        await expect(this.scanners.connect(this.accounts.user1).adminUpdate(SCANNER_ID, 2, 'metadata2')).to.be.revertedWith(
            `MissingRole("${this.roles.SCANNER_ADMIN}", "${this.accounts.user1.address}")`
        );
    });

    describe('managers', function () {
        beforeEach(async function () {
            await expect(this.scanners.connect(this.accounts.scanner).register(this.accounts.user1.address, 1, 'metadata')).to.be.not.reverted;
        });

        it('add manager', async function () {
            const SCANNER_ID = this.accounts.scanner.address;
            expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user1.address)).to.be.equal(false);
            expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user2.address)).to.be.equal(false);
            expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user3.address)).to.be.equal(false);
            expect(await this.scanners.getManagerCount(SCANNER_ID)).to.be.equal(0);

            await expect(this.scanners.connect(this.accounts.user1).setManager(SCANNER_ID, this.accounts.user2.address, true))
                .to.emit(this.scanners, 'ManagerEnabled')
                .withArgs(SCANNER_ID, this.accounts.user2.address, true);

            expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user1.address)).to.be.equal(false);
            expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user2.address)).to.be.equal(true);
            expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user3.address)).to.be.equal(false);
            expect(await this.scanners.getManagerCount(SCANNER_ID)).to.be.equal(1);
            expect(await this.scanners.getManagerAt(SCANNER_ID, 0)).to.be.equal(this.accounts.user2.address);
        });

        it('remove manager', async function () {
            const SCANNER_ID = this.accounts.scanner.address;
            expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user1.address)).to.be.equal(false);
            expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user2.address)).to.be.equal(false);
            expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user3.address)).to.be.equal(false);
            expect(await this.scanners.getManagerCount(SCANNER_ID)).to.be.equal(0);

            await expect(this.scanners.connect(this.accounts.user1).setManager(SCANNER_ID, this.accounts.user2.address, true))
                .to.emit(this.scanners, 'ManagerEnabled')
                .withArgs(SCANNER_ID, this.accounts.user2.address, true);
            await expect(this.scanners.connect(this.accounts.user1).setManager(SCANNER_ID, this.accounts.user3.address, true))
                .to.emit(this.scanners, 'ManagerEnabled')
                .withArgs(SCANNER_ID, this.accounts.user3.address, true);

            expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user1.address)).to.be.equal(false);
            expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user2.address)).to.be.equal(true);
            expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user3.address)).to.be.equal(true);
            expect(await this.scanners.getManagerCount(SCANNER_ID)).to.be.equal(2);
            expect(await this.scanners.getManagerAt(SCANNER_ID, 0)).to.be.equal(this.accounts.user2.address);
            expect(await this.scanners.getManagerAt(SCANNER_ID, 1)).to.be.equal(this.accounts.user3.address);

            await expect(this.scanners.connect(this.accounts.user1).setManager(SCANNER_ID, this.accounts.user2.address, false))
                .to.emit(this.scanners, 'ManagerEnabled')
                .withArgs(SCANNER_ID, this.accounts.user2.address, false);

            expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user1.address)).to.be.equal(false);
            expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user2.address)).to.be.equal(false);
            expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user3.address)).to.be.equal(true);
            expect(await this.scanners.getManagerCount(SCANNER_ID)).to.be.equal(1);
            expect(await this.scanners.getManagerAt(SCANNER_ID, 0)).to.be.equal(this.accounts.user3.address);
        });
    });

    describe('enable and disable', async function () {
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
