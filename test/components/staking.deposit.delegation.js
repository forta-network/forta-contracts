const { ethers, network } = require('hardhat');
const { expect } = require('chai');
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
        expect(await this.nodeRunners.ownerOf(1)).to.eq(this.accounts.user1.address);
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

                    expect(await this.nodeRunners.allocatedStakePerScanner(1)).to.eq('33');
                    for (const scanner of SCANNERS) {
                        expect(await this.nodeRunners.allocatedStakeOfScanner(scanner.address)).to.eq('33');
                        expect(await this.staking.allocatedStakeFor(this.stakingSubjects.SCANNER, scanner.address)).to.eq('0');
                        expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(false);
                    }
                    await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '200'))
                        .to.emit(this.staking, 'AllocatedStake')
                        .withArgs(subjectType1, subject1, '200', '300');
                    expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.eq('300');
                    expect(await this.staking.allocatedStakeFor(subjectType1, subject1)).to.eq('300');
                    expect(await this.staking.unallocatedStakeFor(subjectType1, subject1)).to.eq('0');
                    expect(await this.nodeRunners.allocatedStakePerScanner(1)).to.eq('100');
                    for (const scanner of SCANNERS) {
                        expect(await this.nodeRunners.allocatedStakeOfScanner(scanner.address)).to.eq('100');
                        expect(await this.staking.allocatedStakeFor(this.stakingSubjects.SCANNER, scanner.address)).to.eq('0');
                        expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(true);
                    }
                });
                it('allocation should be sensitive to managed subject disabling', async function () {
                    await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '200'))
                        .to.emit(this.staking, 'AllocatedStake')
                        .withArgs(subjectType1, subject1, '200', '200');
                    expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.eq('200');
                    expect(await this.staking.allocatedStakeFor(subjectType1, subject1)).to.eq('200');
                    expect(await this.staking.unallocatedStakeFor(subjectType1, subject1)).to.eq('0');
                    expect(await this.nodeRunners.allocatedStakePerScanner(1)).to.eq('66');
                    for (const scanner of SCANNERS) {
                        expect(await this.nodeRunners.allocatedStakeOfScanner(scanner.address)).to.eq('66');
                        expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(false);
                    }
                    await this.nodeRunners.connect(this.accounts.user1).disableScanner(SCANNERS[0].address);
                    expect(await this.nodeRunners.allocatedStakePerScanner(1)).to.eq('100');
                    for (const scanner of SCANNERS) {
                        if (scanner === SCANNERS[0]) {
                            expect(await this.nodeRunners.allocatedStakeOfScanner(scanner.address)).to.eq('0');
                            expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(false);
                        } else {
                            expect(await this.nodeRunners.allocatedStakeOfScanner(scanner.address)).to.eq('100');
                            expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(true);
                        }
                    }
                    await this.nodeRunners.connect(this.accounts.user1).enableScanner(SCANNERS[0].address);
                    expect(await this.nodeRunners.allocatedStakePerScanner(1)).to.eq('66');
                    for (const scanner of SCANNERS) {
                        expect(await this.nodeRunners.allocatedStakeOfScanner(scanner.address)).to.eq('66');
                        expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(false);
                    }
                });
                it('should allocate up to max for manager', async function () {
                    const maxPlusOne = `${Number(MAX_STAKE_MANAGER) + 1}`;
                    await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, maxPlusOne))
                        .to.emit(this.staking, 'AllocatedStake')
                        .withArgs(subjectType1, subject1, `${Number(MAX_STAKE_MANAGED) * 3}`, `${Number(MAX_STAKE_MANAGED) * 3}`)
                        .to.emit(this.staking, 'StakeDeposited')
                        .withArgs(subjectType1, subject1, this.accounts.user1.address, MAX_STAKE_MANAGER);
                    const maxAllocated = Number(MAX_STAKE_MANAGED) * SCANNERS.length;
                    expect(await this.staking.allocatedStakeFor(subjectType1, subject1)).to.eq(`${maxAllocated}`);
                    expect(await this.nodeRunners.allocatedStakePerScanner(1)).to.eq(MAX_STAKE_MANAGED);
                    expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.eq(MAX_STAKE_MANAGER);
                });
                it('active stake = allocated + unallocated', async function () {
                    const staked = Number(MAX_STAKE_MANAGER) - 1;

                    await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, staked))
                        .to.emit(this.staking, 'StakeDeposited')
                        .withArgs(subjectType1, subject1, this.accounts.user1.address, staked)
                        .to.emit(this.staking, 'AllocatedStake')
                        .withArgs(subjectType1, subject1, `${Number(MAX_STAKE_MANAGED) * 3}`, `${Number(MAX_STAKE_MANAGED) * 3}`)
                        .to.emit(this.staking, 'UnallocatedStake')
                        .withArgs(
                            subjectType1,
                            subject1,
                            `${Number(MAX_STAKE_MANAGER) - 1 - Number(MAX_STAKE_MANAGED) * 3}`,
                            `${Number(MAX_STAKE_MANAGER) - 1 - Number(MAX_STAKE_MANAGED) * 3}`
                        );
                    const active = await this.staking.activeStakeFor(subjectType1, subject1);
                    expect(active).to.eq(staked);
                    const maxAllocated = Number(MAX_STAKE_MANAGED) * SCANNERS.length;
                    const allocated = await this.staking.allocatedStakeFor(subjectType1, subject1);
                    expect(allocated).to.eq(`${maxAllocated}`);
                    const unallocated = await this.staking.unallocatedStakeFor(subjectType1, subject1);
                    const expectedUnallocated = staked - maxAllocated;
                    expect(unallocated).to.eq(`${expectedUnallocated}`);
                    expect(allocated.add(unallocated)).to.eq(active);
                    expect(await this.nodeRunners.allocatedStakePerScanner(1)).to.eq(MAX_STAKE_MANAGED);
                });

                it('scanners should be disabled if scanner threshold rises over current stake', async function () {
                    const maxPlusOne = `${Number(MAX_STAKE_MANAGER) + 1}`;
                    await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, maxPlusOne))
                        .to.emit(this.staking, 'AllocatedStake')
                        .withArgs(subjectType1, subject1, `${Number(MAX_STAKE_MANAGED) * 3}`, `${Number(MAX_STAKE_MANAGED) * 3}`)
                        .to.emit(this.staking, 'StakeDeposited')
                        .withArgs(subjectType1, subject1, this.accounts.user1.address, MAX_STAKE_MANAGER);
                    for (const scanner of SCANNERS) {
                        expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(true);
                    }
                    const newMin = `${Number(MAX_STAKE_MANAGED) + 1}`;
                    await this.nodeRunners.connect(this.accounts.manager).setManagedStakeThreshold({ max: MAX_STAKE_MANAGER, min: newMin, activated: true }, 1);
                    for (const scanner of SCANNERS) {
                        expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(false);
                    }
                });

                it('scanners should be disabled if scanner threshold rises over nodeRunners stake', async function () {
                    const staked = '2000';
                    await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, staked))
                        .to.emit(this.staking, 'AllocatedStake')
                        .withArgs(subjectType1, subject1, staked, staked)
                        .to.emit(this.staking, 'StakeDeposited')
                        .withArgs(subjectType1, subject1, this.accounts.user1.address, staked);
                    expect(await this.nodeRunners.isNodeRunnerOperational(1)).to.eq(true);
                    for (const scanner of SCANNERS) {
                        expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(true);
                    }
                    const newMin = `${Number(staked) + 1}`;
                    await this.nodeRunners.connect(this.accounts.manager).setStakeThreshold({ max: MAX_STAKE_MANAGER, min: newMin, activated: true });
                    expect(await this.nodeRunners.isNodeRunnerOperational(1)).to.eq(false);
                    for (const scanner of SCANNERS) {
                        expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(false);
                    }
                });

                it('should not deposit if not owner of delegated/manager subject', async function () {
                    const staked = '2000';
                    await expect(this.staking.connect(this.accounts.user2).deposit(subjectType1, subject1, staked)).to.be.revertedWith(
                        `SenderCannotAllocateFor(${subjectType1}, ${subject1})`
                    );
                });
            });

            describe('Unallocation and Manual Allocation', function () {
                it('should unallocate allocated stake', async function () {
                    const staked = '3000';
                    await this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, staked);
                    expect(await this.nodeRunners.isNodeRunnerOperational(1)).to.eq(true);
                    expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.eq('3000');
                    expect(await this.staking.allocatedStakeFor(subjectType1, subject1)).to.eq('3000');
                    expect(await this.staking.unallocatedStakeFor(subjectType1, subject1)).to.eq('0');
                    for (const scanner of SCANNERS) {
                        expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(true);
                        expect(await this.nodeRunners.allocatedStakeOfScanner(scanner.address)).to.eq('1000');
                    }
                    const unallocated = '100';
                    await expect(this.staking.connect(this.accounts.user1).unallocateStake(subjectType1, subject1, unallocated))
                        .to.emit(this.staking, 'UnallocatedStake')
                        .withArgs(subjectType1, subject1, '100', '100');
                    expect(await this.nodeRunners.isNodeRunnerOperational(1)).to.eq(true);
                    expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.eq('3000');
                    expect(await this.staking.allocatedStakeFor(subjectType1, subject1)).to.eq('2900');
                    expect(await this.staking.unallocatedStakeFor(subjectType1, subject1)).to.eq('100');
                    for (const scanner of SCANNERS) {
                        expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(true);
                        expect(await this.nodeRunners.allocatedStakeOfScanner(scanner.address)).to.eq('966');
                    }
                });

                it('should revert if unallocating more than allocated', async function () {
                    const staked = '3000';
                    await this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, staked);
                    const unallocated = '4000';
                    await expect(this.staking.connect(this.accounts.user1).unallocateStake(subjectType1, subject1, unallocated)).to.be.revertedWith(
                        `AmountTooLarge(${unallocated}, ${staked})`
                    );

                    await this.staking.connect(this.accounts.user1).unallocateStake(subjectType1, subject1, '1000');
                    await expect(this.staking.connect(this.accounts.user1).allocateStake(subjectType1, subject1, '2000')).to.be.revertedWith(`AmountTooLarge(2000, 1000)`);
                });

                it('should disable managed subjects if unallocate under min managed', async function () {
                    await this.nodeRunners.connect(this.accounts.manager).setManagedStakeThreshold({ max: '10000', min: '1000', activated: true }, 1);
                    const staked = '3000';
                    await this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, staked);
                    expect(await this.nodeRunners.isNodeRunnerOperational(1)).to.eq(true);
                    expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.eq('3000');
                    expect(await this.staking.allocatedStakeFor(subjectType1, subject1)).to.eq('3000');
                    expect(await this.staking.unallocatedStakeFor(subjectType1, subject1)).to.eq('0');
                    for (const scanner of SCANNERS) {
                        expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(true);
                        expect(await this.nodeRunners.allocatedStakeOfScanner(scanner.address)).to.eq('1000');
                    }
                    const unallocated = '1000';
                    await expect(this.staking.connect(this.accounts.user1).unallocateStake(subjectType1, subject1, unallocated))
                        .to.emit(this.staking, 'UnallocatedStake')
                        .withArgs(subjectType1, subject1, '1000', '1000');
                    expect(await this.nodeRunners.isNodeRunnerOperational(1)).to.eq(true);
                    expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.eq('3000');
                    expect(await this.staking.allocatedStakeFor(subjectType1, subject1)).to.eq('2000');
                    expect(await this.staking.unallocatedStakeFor(subjectType1, subject1)).to.eq('1000');
                    for (const scanner of SCANNERS) {
                        expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(false);
                        expect(await this.nodeRunners.allocatedStakeOfScanner(scanner.address)).to.eq('666');
                    }
                });
                it('should allocate after unallocate', async function () {
                    const staked = '3000';
                    await this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, staked);
                    expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.eq('3000');
                    expect(await this.staking.allocatedStakeFor(subjectType1, subject1)).to.eq('3000');
                    expect(await this.staking.unallocatedStakeFor(subjectType1, subject1)).to.eq('0');
                    const unallocated = '2000';
                    await expect(this.staking.connect(this.accounts.user1).unallocateStake(subjectType1, subject1, unallocated))
                        .to.emit(this.staking, 'UnallocatedStake')
                        .withArgs(subjectType1, subject1, '2000', '2000');
                    expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.eq('3000');
                    expect(await this.staking.allocatedStakeFor(subjectType1, subject1)).to.eq('1000');
                    expect(await this.staking.unallocatedStakeFor(subjectType1, subject1)).to.eq('2000');
                    await expect(this.staking.connect(this.accounts.user1).allocateStake(subjectType1, subject1, '500'))
                        .to.emit(this.staking, 'AllocatedStake')
                        .withArgs(subjectType1, subject1, '500', '1500');
                    expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.eq('3000');
                    expect(await this.staking.allocatedStakeFor(subjectType1, subject1)).to.eq('1500');
                    expect(await this.staking.unallocatedStakeFor(subjectType1, subject1)).to.eq('1500');
                    await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '1000'))
                        .to.emit(this.staking, 'AllocatedStake')
                        .withArgs(subjectType1, subject1, '1000', '2500')
                        .to.emit(this.staking, 'StakeDeposited')
                        .withArgs(subjectType1, subject1, this.accounts.user1.address, '1000');
                    expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.eq('4000');
                    expect(await this.staking.allocatedStakeFor(subjectType1, subject1)).to.eq('2500');
                    expect(await this.staking.unallocatedStakeFor(subjectType1, subject1)).to.eq('1500');
                });
                it('should not allocate if not owner of delegated/manager subject', async function () {
                    const staked = '2000';
                    await expect(this.staking.connect(this.accounts.user2).unallocateStake(subjectType1, subject1, staked)).to.be.revertedWith(
                        `SenderCannotAllocateFor(${subjectType1}, ${subject1})`
                    );
                    await expect(this.staking.connect(this.accounts.user2).allocateStake(subjectType1, subject1, staked)).to.be.revertedWith(
                        `SenderCannotAllocateFor(${subjectType1}, ${subject1})`
                    );
                });
            });

            describe('On Init Withdraw', function () {
                it('burns from allocated', async function () {
                    const staked = '3000';
                    await this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, staked);
                    expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.eq('3000');
                    expect(await this.staking.allocatedStakeFor(subjectType1, subject1)).to.eq('3000');
                    expect(await this.staking.unallocatedStakeFor(subjectType1, subject1)).to.eq('0');
                    await expect(this.staking.connect(this.accounts.user1).initiateWithdrawal(subjectType1, subject1, '2000'))
                        .to.emit(this.staking, 'UnallocatedStake')
                        .withArgs(subjectType1, subject1, '2000', 0);
                    expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.eq('1000');
                    expect(await this.staking.allocatedStakeFor(subjectType1, subject1)).to.eq('1000');
                    expect(await this.staking.unallocatedStakeFor(subjectType1, subject1)).to.eq('0');
                });

                it('burns from unallocated and allocated', async function () {
                    const staked = '3000';
                    await this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, staked);
                    await this.staking.connect(this.accounts.user1).unallocateStake(subjectType1, subject1, '2000');
                    expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.eq('3000');
                    expect(await this.staking.allocatedStakeFor(subjectType1, subject1)).to.eq('1000');
                    expect(await this.staking.unallocatedStakeFor(subjectType1, subject1)).to.eq('2000');
                    await expect(this.staking.connect(this.accounts.user1).initiateWithdrawal(subjectType1, subject1, '2500'))
                        .to.emit(this.staking, 'UnallocatedStake')
                        .withArgs(subjectType1, subject1, '2500', 0);
                    expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.eq('500');
                    expect(await this.staking.allocatedStakeFor(subjectType1, subject1)).to.eq('500');
                    expect(await this.staking.unallocatedStakeFor(subjectType1, subject1)).to.eq('0');
                });

                it('burns from unallocated', async function () {
                    const staked = '3000';
                    await this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, staked);
                    await this.staking.connect(this.accounts.user1).unallocateStake(subjectType1, subject1, '3000');
                    expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.eq('3000');
                    expect(await this.staking.allocatedStakeFor(subjectType1, subject1)).to.eq('0');
                    expect(await this.staking.unallocatedStakeFor(subjectType1, subject1)).to.eq('3000');
                    await expect(this.staking.connect(this.accounts.user1).initiateWithdrawal(subjectType1, subject1, '2500'))
                        .to.emit(this.staking, 'UnallocatedStake')
                        .withArgs(subjectType1, subject1, '2500', '500');
                    expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.eq('500');
                    expect(await this.staking.allocatedStakeFor(subjectType1, subject1)).to.eq('0');
                    expect(await this.staking.unallocatedStakeFor(subjectType1, subject1)).to.eq('500');
                });
            });
        });
    });

    describe('Deposit / Withdraw', function () {
        describe('Delegated', function () {
            const DELAY = 86400;
            beforeEach(async function () {
                await expect(this.staking.setDelay(DELAY)).to.emit(this.staking, 'DelaySet').withArgs(DELAY);
                await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner(chainId);
            });

            it('happy path', async function () {
                expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('0');
                expect(await this.staking.totalActiveStake()).to.be.equal('0');
                expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');
                expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('0');

                await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '100'))
                    .to.emit(this.token, 'Transfer')
                    .withArgs(this.accounts.user1.address, this.staking.address, '100')
                    .to.emit(this.staking, 'TransferSingle')
                    .withArgs(this.accounts.user1.address, ethers.constants.AddressZero, this.accounts.user1.address, active1, '100')
                    .to.emit(this.staking, 'StakeDeposited')
                    .withArgs(subjectType1, subject1, this.accounts.user1.address, '100');

                expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('100');
                expect(await this.staking.totalActiveStake()).to.be.equal('100');
                expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('100');
                expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('100');

                await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType1, subject1)).to.be.reverted;

                const tx1 = await this.staking.connect(this.accounts.user1).initiateWithdrawal(subjectType1, subject1, '50');
                await expect(tx1)
                    .to.emit(this.staking, 'WithdrawalInitiated')
                    .withArgs(subjectType1, subject1, this.accounts.user1.address, (await txTimestamp(tx1)) + DELAY)
                    .to.emit(this.staking, 'TransferSingle');

                await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType1, subject1)).to.be.reverted;

                await network.provider.send('evm_increaseTime', [DELAY]);

                await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType1, subject1))
                    .to.emit(this.token, 'Transfer')
                    .withArgs(this.staking.address, this.accounts.user1.address, '50')
                    .to.emit(this.staking, 'TransferSingle')
                    .withArgs(this.accounts.user1.address, this.accounts.user1.address, ethers.constants.AddressZero, inactive1, '50')
                    .to.emit(this.staking, 'WithdrawalExecuted')
                    .withArgs(subjectType1, subject1, this.accounts.user1.address);

                expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('50');
                expect(await this.staking.totalActiveStake()).to.be.equal('50');
                expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('50');
                expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('50');
            });
        });
    });
});
