const { ethers, network } = require('hardhat');
const { expect, assert } = require('chai');
const { prepare } = require('../fixture');
const { subjectToActive, subjectToInactive } = require('../../scripts/utils/staking.js');
const { signERC712ScannerRegistration } = require('../../scripts/utils/scannerRegistration');

const subjects = [
    [ethers.BigNumber.from('1'), 2], // Node Runner id, Node Runner Type
];
const [[subject1, subjectType1, active1, inactive1]] = subjects.map((items) => [items[0], items[1], subjectToActive(items[1], items[0]), subjectToInactive(items[1], items[0])]);
const txTimestamp = (tx) =>
    tx
        .wait()
        .then(({ blockNumber }) => ethers.provider.getBlock(blockNumber))
        .then(({ timestamp }) => timestamp);

const MAX_STAKE_MANAGED = '1000';
const MIN_STAKE_MANAGED = '100';

const MAX_STAKE_MANAGER = '10000';
const chainId = 1;
let SCANNERS;
describe.only('Staking - Delegated and Delegators', function () {
    prepare({
        stake: {
            scanners: { min: MIN_STAKE_MANAGED, max: MAX_STAKE_MANAGED, activated: true },
            nodeRunners: { min: '1', max: MAX_STAKE_MANAGER, activated: true },
        },
    });

    beforeEach(async function () {
        SCANNERS = [this.accounts.other, this.accounts.minter, this.accounts.treasure];
        await this.token.connect(this.accounts.minter).mint(this.accounts.user1.address, ethers.utils.parseEther('1000'));
        await this.token.connect(this.accounts.minter).mint(this.accounts.user2.address, ethers.utils.parseEther('1000'));
        await this.token.connect(this.accounts.minter).mint(this.accounts.user3.address, ethers.utils.parseEther('1000'));

        await this.token.connect(this.accounts.user1).approve(this.staking.address, ethers.constants.MaxUint256);
        await this.token.connect(this.accounts.user2).approve(this.staking.address, ethers.constants.MaxUint256);
        await this.token.connect(this.accounts.user3).approve(this.staking.address, ethers.constants.MaxUint256);

        await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner(chainId);
        const network = await ethers.provider.getNetwork();

        const verifyingContractInfo = {
            address: this.nodeRunners.address,
            chainId: network.chainId,
        };
        for (const scanner of SCANNERS) {
            const registration = {
                scanner: scanner.address,
                nodeRunnerId: 1,
                chainId: chainId,
                metadata: 'metadata',
                timestamp: (await ethers.provider.getBlock('latest')).timestamp,
            };
            const signature = await signERC712ScannerRegistration(verifyingContractInfo, registration, scanner);
            await this.nodeRunners.connect(this.accounts.user1).registerScannerNode(registration, signature);
            expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(false);
        }
    });

    describe('Subject Agency', function () {
        it('should know agency for subject types', async function () {
            expect(await this.staking.getSubjectTypeAgency(this.stakingSubjects.SCANNER)).to.eq(this.subjectAgency.MANAGED);
            expect(await this.staking.getSubjectTypeAgency(this.stakingSubjects.AGENT)).to.eq(this.subjectAgency.DIRECT);
            expect(await this.staking.getSubjectTypeAgency(this.stakingSubjects.NODE_RUNNER)).to.eq(this.subjectAgency.DELEGATED);
            expect(await this.staking.getSubjectTypeAgency(this.stakingSubjects.UNDEFINED)).to.eq(this.subjectAgency.UNDEFINED);
            expect(await this.staking.getSubjectTypeAgency(123)).to.eq(this.subjectAgency.UNDEFINED);
        });

        it('should know managed types for subject types', async function () {
            expect(await this.staking.getManagedTypeFor(this.stakingSubjects.NODE_RUNNER)).to.eq(this.stakingSubjects.SCANNER);
            expect(await this.staking.getManagedTypeFor(this.stakingSubjects.SCANNER)).to.eq(this.stakingSubjects.UNDEFINED);
            expect(await this.staking.getManagedTypeFor(this.stakingSubjects.AGENT)).to.eq(this.stakingSubjects.UNDEFINED);
            expect(await this.staking.getManagedTypeFor(this.stakingSubjects.UNDEFINED)).to.eq(this.stakingSubjects.UNDEFINED);
        });
    });

    describe('Delegated', function () {
        describe('Allocation', function () {
            describe('On Deposit', function () {
                it('should allocate between all managed subjects', async function () {
                    await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '100'))
                        .to.emit(this.staking, 'AllocatedStake')
                        .withArgs(subjectType1, subject1, '100', '100');

                    expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.eq('100');
                    expect(await this.staking.allocatedStakeFor(subjectType1, subject1)).to.eq('100');
                    expect(await this.staking.unallocatedStakeFor(subjectType1, subject1)).to.eq('0');

                    for (const scanner of SCANNERS) {
                        console.log(scanner.address);
                        expect(await this.staking.allocatedStakeIn(this.stakingSubjects.SCANNER, scanner.address)).to.eq('33');
                        expect(await this.staking.allocatedStakeFor(this.stakingSubjects.SCANNER, scanner.address)).to.eq('0');
                        expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(false);
                        //expect(await this.nodeRunners.getScannerState(scanner.address)).to.eq(false);
                    }
                    await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '200'))
                        .to.emit(this.staking, 'AllocatedStake')
                        .withArgs(subjectType1, subject1, '100', '300');
                    expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.eq('300');
                    expect(await this.staking.allocatedStakeFor(subjectType1, subject1)).to.eq('300');
                    expect(await this.staking.unallocatedStakeFor(subjectType1, subject1)).to.eq('0');
                });
                it.skip('allocation should be sensitive to managed subject disabling', async function () {});
                it.skip('should allocate up to max for manager', async function () {});
                it.skip('should have unallocated stake if more than max managed', async function () {});

                it.skip('should top allocated and unallocated stake if more than max managed and up to max manager', async function () {});
            });

            describe.skip('Manual Allocation', function () {
                it('should allocate unallocated stake', async function () {});
                it('should allocate unallocated stake up to max for managed', async function () {});
                it('should have unallocated stake if disabling managed subject sends allocated over max managed', async function () {});
            });

            describe.skip('Manual Unallocation', function () {
                it('should unallocate allocated stake', async function () {});

                it('should disable managed subjects if unallocate under min managed', async function () {});
            });

            describe.skip('On Init Withdraw', function () {
                it('should not initWithdraw if no unallocated stake', async function () {});

                it('should initWithdraw if unallocated stake', async function () {});

                it('should disable managed subjects if unallocate under min managed', async function () {});
            });
        });
    });

    describe.skip('Deposit / Withdraw', function () {
        describe('Delegated', function () {
            const DELAY = 86400;
            beforeEach(async function () {
                await expect(this.staking.setDelay(DELAY)).to.emit(this.staking, 'DelaySet').withArgs(DELAY);
            });

            it('fails to set delay if not withing limits', async function () {
                const min = await this.staking.MIN_WITHDRAWAL_DELAY();
                const tooSmall = min.sub(1);
                await expect(this.staking.setDelay(tooSmall)).to.be.revertedWith(`AmountTooSmall(${tooSmall.toString()}, ${min.toString()})`);
                const max = await this.staking.MAX_WITHDRAWAL_DELAY();
                const tooBig = max.add(1);
                await expect(this.staking.setDelay(tooBig)).to.be.revertedWith(`AmountTooLarge(${tooBig.toString()}, ${max.toString()})`);
            });

            it('happy path', async function () {
                expect(await this.staking.activeStakeFor(subjectType2, subject2)).to.be.equal('0');
                expect(await this.staking.totalActiveStake()).to.be.equal('0');
                expect(await this.staking.sharesOf(subjectType2, subject2, this.accounts.user1.address)).to.be.equal('0');
                expect(await this.staking.sharesOf(subjectType2, subject2, this.accounts.user2.address)).to.be.equal('0');
                expect(await this.staking.totalShares(subjectType2, subject2)).to.be.equal('0');

                await expect(this.staking.connect(this.accounts.user1).deposit(subjectType2, subject2, '100'))
                    .to.emit(this.token, 'Transfer')
                    .withArgs(this.accounts.user1.address, this.staking.address, '100')
                    .to.emit(this.staking, 'TransferSingle')
                    .withArgs(this.accounts.user1.address, ethers.constants.AddressZero, this.accounts.user1.address, active1, '100')
                    .to.emit(this.staking, 'StakeDeposited')
                    .withArgs(subjectType2, subject2, this.accounts.user1.address, '100');

                expect(await this.staking.activeStakeFor(subjectType2, subject2)).to.be.equal('100');
                expect(await this.staking.totalActiveStake()).to.be.equal('100');
                expect(await this.staking.sharesOf(subjectType2, subject2, this.accounts.user1.address)).to.be.equal('100');
                expect(await this.staking.sharesOf(subjectType2, subject2, this.accounts.user2.address)).to.be.equal('0');
                expect(await this.staking.totalShares(subjectType2, subject2)).to.be.equal('100');

                await expect(this.staking.connect(this.accounts.user2).deposit(subjectType2, subject2, '100'))
                    .to.emit(this.token, 'Transfer')
                    .withArgs(this.accounts.user2.address, this.staking.address, '100')
                    .to.emit(this.staking, 'TransferSingle')
                    .withArgs(this.accounts.user2.address, ethers.constants.AddressZero, this.accounts.user2.address, active1, '100')
                    .to.emit(this.staking, 'StakeDeposited')
                    .withArgs(subjectType2, subject2, this.accounts.user2.address, '100');

                expect(await this.staking.activeStakeFor(subjectType2, subject2)).to.be.equal('200');
                expect(await this.staking.totalActiveStake()).to.be.equal('200');
                expect(await this.staking.sharesOf(subjectType2, subject2, this.accounts.user1.address)).to.be.equal('100');
                expect(await this.staking.sharesOf(subjectType2, subject2, this.accounts.user2.address)).to.be.equal('100');
                expect(await this.staking.totalShares(subjectType2, subject2)).to.be.equal('200');

                await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType2, subject2)).to.be.reverted;
                await expect(this.staking.connect(this.accounts.user2).withdraw(subjectType2, subject2)).to.be.reverted;

                const tx1 = await this.staking.connect(this.accounts.user1).initiateWithdrawal(subjectType2, subject2, '50');
                await expect(tx1)
                    .to.emit(this.staking, 'WithdrawalInitiated')
                    .withArgs(subjectType2, subject2, this.accounts.user1.address, (await txTimestamp(tx1)) + DELAY)
                    .to.emit(this.staking, 'TransferSingle') /*.withArgs(this.accounts.user2.address, this.accounts.user2.address, ethers.constants.AddressZero, subject1, '100')*/
                    .to.emit(
                        this.staking,
                        'TransferSingle'
                    ); /*.withArgs(this.accounts.user2.address, ethers.constants.AddressZero, this.accounts.user2.address, inactive1, '100')*/

                await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType2, subject2)).to.be.reverted;

                await network.provider.send('evm_increaseTime', [DELAY]);

                await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType2, subject2))
                    .to.emit(this.token, 'Transfer')
                    .withArgs(this.staking.address, this.accounts.user1.address, '50')
                    .to.emit(this.staking, 'TransferSingle')
                    .withArgs(this.accounts.user1.address, this.accounts.user1.address, ethers.constants.AddressZero, inactive1, '50')
                    .to.emit(this.staking, 'WithdrawalExecuted')
                    .withArgs(subjectType2, subject2, this.accounts.user1.address);

                expect(await this.staking.activeStakeFor(subjectType2, subject2)).to.be.equal('150');
                expect(await this.staking.totalActiveStake()).to.be.equal('150');
                expect(await this.staking.sharesOf(subjectType2, subject2, this.accounts.user1.address)).to.be.equal('50');
                expect(await this.staking.sharesOf(subjectType2, subject2, this.accounts.user2.address)).to.be.equal('100');
                expect(await this.staking.totalShares(subjectType2, subject2)).to.be.equal('150');

                await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType2, subject2)).to.be.reverted;
                await expect(this.staking.connect(this.accounts.user2).withdraw(subjectType2, subject2)).to.be.reverted;

                const tx2 = await this.staking.connect(this.accounts.user2).initiateWithdrawal(subjectType2, subject2, '100');
                await expect(tx2)
                    .to.emit(this.staking, 'WithdrawalInitiated')
                    .withArgs(subjectType2, subject2, this.accounts.user2.address, (await txTimestamp(tx2)) + DELAY)
                    .to.emit(this.staking, 'TransferSingle') /*.withArgs(this.accounts.user2.address, this.accounts.user2.address, ethers.constants.AddressZero, subject1, '100')*/
                    .to.emit(
                        this.staking,
                        'TransferSingle'
                    ); /*.withArgs(this.accounts.user2.address, ethers.constants.AddressZero, this.accounts.user2.address, inactive1, '100')*/

                await expect(this.staking.connect(this.accounts.user2).withdraw(subjectType2, subject2)).to.be.reverted;

                await network.provider.send('evm_increaseTime', [DELAY]);

                await expect(this.staking.connect(this.accounts.user2).withdraw(subjectType2, subject2))
                    .to.emit(this.token, 'Transfer')
                    .withArgs(this.staking.address, this.accounts.user2.address, '100')
                    .to.emit(this.staking, 'TransferSingle')
                    .withArgs(this.accounts.user2.address, this.accounts.user2.address, ethers.constants.AddressZero, inactive1, '100')
                    .to.emit(this.staking, 'WithdrawalExecuted')
                    .withArgs(subjectType2, subject2, this.accounts.user2.address);

                expect(await this.staking.activeStakeFor(subjectType2, subject2)).to.be.equal('50');
                expect(await this.staking.totalActiveStake()).to.be.equal('50');
                expect(await this.staking.sharesOf(subjectType2, subject2, this.accounts.user1.address)).to.be.equal('50');
                expect(await this.staking.sharesOf(subjectType2, subject2, this.accounts.user2.address)).to.be.equal('0');
                expect(await this.staking.totalShares(subjectType2, subject2)).to.be.equal('50');

                await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType2, subject2)).to.be.reverted;
                await expect(this.staking.connect(this.accounts.user2).withdraw(subjectType2, subject2)).to.be.reverted;
            });
        });
    });
});
