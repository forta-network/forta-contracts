const { ethers, network } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');
const { subjectToActive, subjectToInactive } = require('../../scripts/utils/staking.js');
const { signERC712ScannerRegistration } = require('../../scripts/utils/scannerRegistration');

const subjects = [
    [ethers.BigNumber.from('1'), 2],
    [ethers.BigNumber.from('1'), 3],
];
const [[nodeRunnerId, nodeRunnerSubjectType, nodeRunnerActive, nodeRunnerInactive], [_, delegatorSubjectType, delegatorActive, delegatorInactive]] = subjects.map((items) => [
    items[0],
    items[1],
    subjectToActive(items[1], items[0]),
    subjectToInactive(items[1], items[0]),
]);
const txTimestamp = (tx) =>
    tx
        .wait()
        .then(({ blockNumber }) => ethers.provider.getBlock(blockNumber))
        .then(({ timestamp }) => timestamp);

const MAX_STAKE_MANAGED = '1000';
const MIN_STAKE_MANAGED = '100';

const STAKE = '10000';
const chainId = 1;
let SCANNERS;
describe('Staking - Delegation', function () {
    prepare({
        stake: {
            scanners: { min: MIN_STAKE_MANAGED, max: MAX_STAKE_MANAGED, activated: true },
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
        expect(await this.nodeRunners.ownerOf('1')).to.eq(this.accounts.user1.address);
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
    });

    describe('Allocation', function () {
        describe('On Deposit', function () {
            it('should allocate between all managed subjects', async function () {
                await expect(this.staking.connect(this.accounts.user1).deposit(nodeRunnerSubjectType, nodeRunnerId, '100'))
                    .to.emit(this.stakeAllocator, 'AllocatedStake')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, true, '100', '100');

                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('100');
                expect(await this.stakeAllocator.allocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('100');
                expect(await this.stakeAllocator.unallocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('0');

                expect(await this.stakeAllocator.allocatedStakePerManaged(2, 1)).to.eq('33');
                expect(33).to.be.lt((await this.nodeRunners.getManagedStakeThreshold(1)).min);
                for (const scanner of SCANNERS) {
                    expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(false);
                }
                await expect(this.staking.connect(this.accounts.user1).deposit(nodeRunnerSubjectType, nodeRunnerId, '200'))
                    .to.emit(this.stakeAllocator, 'AllocatedStake')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, true, '200', '300');
                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('300');
                expect(await this.stakeAllocator.allocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('300');
                expect(await this.stakeAllocator.unallocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('0');
                expect(await this.stakeAllocator.allocatedStakePerManaged(2, 1)).to.eq('100');
                for (const scanner of SCANNERS) {
                    expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(true);
                }

                await expect(this.staking.connect(this.accounts.user1).deposit(delegatorSubjectType, nodeRunnerId, '100'))
                    .to.emit(this.stakeAllocator, 'AllocatedStake')
                    .withArgs(delegatorSubjectType, nodeRunnerId, true, '100', '100');
                expect(await this.staking.activeStakeFor(delegatorSubjectType, nodeRunnerId)).to.eq('100');
                expect(await this.stakeAllocator.allocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('300');
                expect(await this.stakeAllocator.allocatedStakeFor(delegatorSubjectType, nodeRunnerId)).to.eq('100');
                expect(await this.stakeAllocator.unallocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('0');
                expect(await this.stakeAllocator.allocatedStakePerManaged(2, 1)).to.eq('133');
                expect(await this.stakeAllocator.allocatedOwnStakePerManaged(2, 1)).to.eq('100');
                expect(await this.stakeAllocator.allocatedDelegatorsStakePerManaged(2, 1)).to.eq('33');
            });

            it('delegating over max goes to unallocated', async function () {
                const staked = MAX_STAKE_MANAGED * 3;
                await expect(this.staking.connect(this.accounts.user1).deposit(nodeRunnerSubjectType, nodeRunnerId, staked))
                    .to.emit(this.stakeAllocator, 'AllocatedStake')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, true, staked, staked);

                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq(staked);
                expect(await this.staking.activeStakeFor(delegatorSubjectType, nodeRunnerId)).to.eq('0');
                expect(await this.stakeAllocator.allocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq(staked);
                expect(await this.stakeAllocator.unallocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('0');
                expect(await this.stakeAllocator.allocatedStakeFor(delegatorSubjectType, nodeRunnerId)).to.eq('0');
                expect(await this.stakeAllocator.unallocatedStakeFor(delegatorSubjectType, nodeRunnerId)).to.eq('0');
                expect(await this.stakeAllocator.allocatedStakePerManaged(2, 1)).to.eq(MAX_STAKE_MANAGED);
                expect(await this.stakeAllocator.allocatedOwnStakePerManaged(2, 1)).to.eq(MAX_STAKE_MANAGED);
                expect(await this.stakeAllocator.allocatedDelegatorsStakePerManaged(2, 1)).to.eq('0');

                await expect(this.staking.connect(this.accounts.user1).deposit(delegatorSubjectType, nodeRunnerId, '200'))
                    .to.emit(this.stakeAllocator, 'UnallocatedStake')
                    .withArgs(delegatorSubjectType, nodeRunnerId, true, '200', '200');
                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq(staked);
                expect(await this.staking.activeStakeFor(delegatorSubjectType, nodeRunnerId)).to.eq('200');
                expect(await this.stakeAllocator.allocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq(staked);
                expect(await this.stakeAllocator.unallocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('0');
                expect(await this.stakeAllocator.allocatedStakeFor(delegatorSubjectType, nodeRunnerId)).to.eq('0');
                expect(await this.stakeAllocator.unallocatedStakeFor(delegatorSubjectType, nodeRunnerId)).to.eq('200');
                expect(await this.stakeAllocator.allocatedStakePerManaged(2, 1)).to.eq(MAX_STAKE_MANAGED);
                expect(await this.stakeAllocator.allocatedOwnStakePerManaged(2, 1)).to.eq(MAX_STAKE_MANAGED);
                expect(await this.stakeAllocator.allocatedDelegatorsStakePerManaged(2, 1)).to.eq('0');
            });

            it('allocation should be sensitive to managed subject disabling', async function () {
                await expect(this.staking.connect(this.accounts.user1).deposit(nodeRunnerSubjectType, nodeRunnerId, '200'))
                    .to.emit(this.stakeAllocator, 'AllocatedStake')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, true, '200', '200');
                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('200');
                expect(await this.stakeAllocator.allocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('200');
                expect(await this.stakeAllocator.unallocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('0');
                expect(await this.stakeAllocator.allocatedStakePerManaged(2, 1)).to.eq('66');
                for (const scanner of SCANNERS) {
                    expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(false);
                }
                await this.nodeRunners.connect(this.accounts.user1).disableScanner(SCANNERS[0].address);
                expect(await this.stakeAllocator.allocatedStakePerManaged(2, 1)).to.eq('100');
                for (const scanner of SCANNERS) {
                    if (scanner === SCANNERS[0]) {
                        expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(false);
                    } else {
                        expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(true);
                    }
                }
                await this.nodeRunners.connect(this.accounts.user1).enableScanner(SCANNERS[0].address);
                expect(await this.stakeAllocator.allocatedStakePerManaged(2, 1)).to.eq('66');
                for (const scanner of SCANNERS) {
                    expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(false);
                }
            });

            it('allocation should be sensitive to managed subject disabling - with delegation', async function () {
                await expect(this.staking.connect(this.accounts.user1).deposit(nodeRunnerSubjectType, nodeRunnerId, '200'))
                    .to.emit(this.stakeAllocator, 'AllocatedStake')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, true, '200', '200');
                expect(await this.subjectGateway.minManagedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('100');
                expect(await this.subjectGateway.totalManagedSubjects(nodeRunnerSubjectType, nodeRunnerId)).to.eq('3');

                expect(await this.stakeAllocator.allocatedStakePerManaged(2, 1)).to.eq('66');
                for (const scanner of SCANNERS) {
                    expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(false);
                }
                await this.nodeRunners.connect(this.accounts.user1).disableScanner(SCANNERS[0].address);
                expect(await this.stakeAllocator.allocatedStakePerManaged(2, 1)).to.eq('100');
                for (const scanner of SCANNERS) {
                    if (scanner === SCANNERS[0]) {
                        expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(false);
                    } else {
                        expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(true);
                    }
                }
                await expect(this.staking.connect(this.accounts.user1).deposit(delegatorSubjectType, nodeRunnerId, '100'))
                    .to.emit(this.stakeAllocator, 'AllocatedStake')
                    .withArgs(delegatorSubjectType, nodeRunnerId, true, '100', '100');
                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('200');
                expect(await this.staking.activeStakeFor(delegatorSubjectType, nodeRunnerId)).to.eq('100');

                expect(await this.stakeAllocator.allocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('200');
                expect(await this.stakeAllocator.allocatedStakeFor(delegatorSubjectType, nodeRunnerId)).to.eq('100');
                expect(await this.stakeAllocator.allocatedManagedStake(nodeRunnerSubjectType, nodeRunnerId)).to.eq('300');

                await this.nodeRunners.connect(this.accounts.user1).enableScanner(SCANNERS[0].address);
                expect(await this.stakeAllocator.allocatedStakePerManaged(2, 1)).to.eq('100');
                for (const scanner of SCANNERS) {
                    expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(true);
                }
            });

            it('active stake = allocated + unallocated', async function () {
                const staked = Number(STAKE);

                await expect(this.staking.connect(this.accounts.user1).deposit(nodeRunnerSubjectType, nodeRunnerId, staked))
                    .to.emit(this.staking, 'StakeDeposited')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, this.accounts.user1.address, staked)
                    .to.emit(this.stakeAllocator, 'AllocatedStake')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, true, `${Number(MAX_STAKE_MANAGED) * 3}`, `${Number(MAX_STAKE_MANAGED) * 3}`)
                    .to.emit(this.stakeAllocator, 'UnallocatedStake')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, true, `${Number(STAKE) - Number(MAX_STAKE_MANAGED) * 3}`, `${Number(STAKE) - Number(MAX_STAKE_MANAGED) * 3}`);
                const active = await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId);
                expect(active).to.eq(staked);
                const maxAllocated = Number(MAX_STAKE_MANAGED) * SCANNERS.length;
                const allocated = await this.stakeAllocator.allocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId);
                expect(allocated).to.eq(`${maxAllocated}`);
                const unallocated = await this.stakeAllocator.unallocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId);
                const expectedUnallocated = staked - maxAllocated;
                expect(unallocated).to.eq(`${expectedUnallocated}`);
                expect(allocated.add(unallocated)).to.eq(active);
                expect(await this.stakeAllocator.allocatedStakePerManaged(2, 1)).to.eq(MAX_STAKE_MANAGED);
            });

            it('scanners should be disabled if scanner threshold rises over current stake', async function () {
                await expect(this.staking.connect(this.accounts.user1).deposit(nodeRunnerSubjectType, nodeRunnerId, STAKE))
                    .to.emit(this.stakeAllocator, 'AllocatedStake')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, true, `${Number(MAX_STAKE_MANAGED) * 3}`, `${Number(MAX_STAKE_MANAGED) * 3}`)
                    .to.emit(this.staking, 'StakeDeposited')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, this.accounts.user1.address, STAKE);
                for (const scanner of SCANNERS) {
                    expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(true);
                }
                const newMin = `${Number(MAX_STAKE_MANAGED) + 1}`;
                await this.nodeRunners.connect(this.accounts.manager).setManagedStakeThreshold({ max: STAKE, min: newMin, activated: true }, 1);
                for (const scanner of SCANNERS) {
                    expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(false);
                }
            });

            it('should not allow delegation if DELEGATE delegation under min', async function () {
                const staked = '2000';
                await expect(this.staking.connect(this.accounts.user2).deposit(delegatorSubjectType, nodeRunnerId, staked)).to.be.revertedWith('CannotDelegateStakeUnderMin(2, 1)');
            });

            it('should not deposit if not owner of delegated/manager subject', async function () {
                const staked = '2000';
                await expect(this.staking.connect(this.accounts.user2).deposit(nodeRunnerSubjectType, nodeRunnerId, staked)).to.be.revertedWith(
                    `SenderCannotAllocateFor(${nodeRunnerSubjectType}, ${nodeRunnerId})`
                );
            });
        });

        describe('Unallocation and Manual Allocation', function () {
            it('should unallocate allocated stake', async function () {
                const staked = '3000';
                await this.staking.connect(this.accounts.user1).deposit(nodeRunnerSubjectType, nodeRunnerId, staked);
                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('3000');
                expect(await this.stakeAllocator.allocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('3000');
                expect(await this.stakeAllocator.unallocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('0');
                expect(await this.stakeAllocator.allocatedStakePerManaged(2, 1)).to.eq('1000');

                for (const scanner of SCANNERS) {
                    expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(true);
                }
                const unallocated = '100';
                await expect(this.stakeAllocator.connect(this.accounts.user1).unallocateOwnStake(nodeRunnerSubjectType, nodeRunnerId, unallocated))
                    .to.emit(this.stakeAllocator, 'AllocatedStake')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, false, '100', '2900')
                    .to.emit(this.stakeAllocator, 'UnallocatedStake')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, true, '100', '100');
                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('3000');
                expect(await this.stakeAllocator.allocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('2900');
                expect(await this.stakeAllocator.unallocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('100');
                expect(await this.stakeAllocator.allocatedStakePerManaged(2, 1)).to.eq('966');
                for (const scanner of SCANNERS) {
                    expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(true);
                }
            });

            it('should revert if unallocating more than allocated', async function () {
                const staked = '3000';
                await this.staking.connect(this.accounts.user1).deposit(nodeRunnerSubjectType, nodeRunnerId, staked);
                const unallocated = '4000';
                await expect(this.stakeAllocator.connect(this.accounts.user1).unallocateOwnStake(nodeRunnerSubjectType, nodeRunnerId, unallocated)).to.be.revertedWith(
                    `AmountTooLarge(${unallocated}, ${staked})`
                );

                await this.stakeAllocator.connect(this.accounts.user1).unallocateOwnStake(nodeRunnerSubjectType, nodeRunnerId, '1000');
                await expect(this.stakeAllocator.connect(this.accounts.user1).allocateOwnStake(nodeRunnerSubjectType, nodeRunnerId, '2000')).to.be.revertedWith(
                    `AmountTooLarge(2000, 1000)`
                );
            });

            it('should disable managed subjects if unallocate under min managed', async function () {
                await this.nodeRunners.connect(this.accounts.manager).setManagedStakeThreshold({ max: '10000', min: '1000', activated: true }, 1);
                const staked = '3000';
                await this.staking.connect(this.accounts.user1).deposit(nodeRunnerSubjectType, nodeRunnerId, staked);
                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('3000');
                expect(await this.stakeAllocator.allocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('3000');
                expect(await this.stakeAllocator.unallocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('0');
                expect(await this.stakeAllocator.allocatedStakePerManaged(2, 1)).to.eq('1000');

                for (const scanner of SCANNERS) {
                    expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(true);
                }
                const unallocated = '1000';
                await expect(this.stakeAllocator.connect(this.accounts.user1).unallocateOwnStake(nodeRunnerSubjectType, nodeRunnerId, unallocated))
                    .to.emit(this.stakeAllocator, 'UnallocatedStake')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, true, '1000', '1000');
                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('3000');
                expect(await this.stakeAllocator.allocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('2000');
                expect(await this.stakeAllocator.unallocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('1000');
                expect(await this.stakeAllocator.allocatedStakePerManaged(2, 1)).to.eq('666');

                for (const scanner of SCANNERS) {
                    expect(await this.nodeRunners.isScannerOperational(scanner.address)).to.eq(false);
                }
            });
            it('should allocate after unallocate', async function () {
                const staked = '3000';
                await this.staking.connect(this.accounts.user1).deposit(nodeRunnerSubjectType, nodeRunnerId, staked);
                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('3000');
                expect(await this.stakeAllocator.allocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('3000');
                expect(await this.stakeAllocator.unallocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('0');
                const unallocated = '2000';
                await expect(this.stakeAllocator.connect(this.accounts.user1).unallocateOwnStake(nodeRunnerSubjectType, nodeRunnerId, unallocated))
                    .to.emit(this.stakeAllocator, 'UnallocatedStake')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, true, '2000', '2000');
                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('3000');
                expect(await this.stakeAllocator.allocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('1000');
                expect(await this.stakeAllocator.unallocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('2000');
                await expect(this.stakeAllocator.connect(this.accounts.user1).allocateOwnStake(nodeRunnerSubjectType, nodeRunnerId, '500'))
                    .to.emit(this.stakeAllocator, 'AllocatedStake')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, true, '500', '1500');
                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('3000');
                expect(await this.stakeAllocator.allocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('1500');
                expect(await this.stakeAllocator.unallocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('1500');
                await expect(this.staking.connect(this.accounts.user1).deposit(nodeRunnerSubjectType, nodeRunnerId, '1000'))
                    .to.emit(this.stakeAllocator, 'AllocatedStake')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, true, '1000', '2500')
                    .to.emit(this.staking, 'StakeDeposited')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, this.accounts.user1.address, '1000');
                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('4000');
                expect(await this.stakeAllocator.allocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('2500');
                expect(await this.stakeAllocator.unallocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('1500');
            });
            it('should not allocate if not owner of delegated/manager subject', async function () {
                const staked = '2000';
                await expect(this.stakeAllocator.connect(this.accounts.user2).unallocateOwnStake(nodeRunnerSubjectType, nodeRunnerId, staked)).to.be.revertedWith(
                    `SenderCannotAllocateFor(${nodeRunnerSubjectType}, ${nodeRunnerId})`
                );
                await expect(this.stakeAllocator.connect(this.accounts.user2).allocateOwnStake(nodeRunnerSubjectType, nodeRunnerId, staked)).to.be.revertedWith(
                    `SenderCannotAllocateFor(${nodeRunnerSubjectType}, ${nodeRunnerId})`
                );
            });
        });

        describe('On Init Withdraw', function () {
            it('burns from allocated', async function () {
                const staked = '3000';
                await this.staking.connect(this.accounts.user1).deposit(nodeRunnerSubjectType, nodeRunnerId, staked);
                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('3000');
                expect(await this.stakeAllocator.allocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('3000');
                expect(await this.stakeAllocator.unallocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('0');
                await expect(this.staking.connect(this.accounts.user1).initiateWithdrawal(nodeRunnerSubjectType, nodeRunnerId, '2000'))
                    .to.emit(this.stakeAllocator, 'UnallocatedStake')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, false, 0, 0)
                    .to.emit(this.stakeAllocator, 'AllocatedStake')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, false, '2000', '1000');
                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('1000');
                expect(await this.stakeAllocator.allocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('1000');
                expect(await this.stakeAllocator.unallocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('0');
            });

            it('burns from unallocated and allocated', async function () {
                const staked = '3000';
                await this.staking.connect(this.accounts.user1).deposit(nodeRunnerSubjectType, nodeRunnerId, staked);
                await this.stakeAllocator.connect(this.accounts.user1).unallocateOwnStake(nodeRunnerSubjectType, nodeRunnerId, '2000');
                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('3000');
                expect(await this.stakeAllocator.allocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('1000');
                expect(await this.stakeAllocator.unallocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('2000');
                await expect(this.staking.connect(this.accounts.user1).initiateWithdrawal(nodeRunnerSubjectType, nodeRunnerId, '2500'))
                    .to.emit(this.stakeAllocator, 'UnallocatedStake')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, false, '2000', '2000')
                    .to.emit(this.stakeAllocator, 'AllocatedStake')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, false, '500', '500');
                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('500');
                expect(await this.stakeAllocator.allocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('500');
                expect(await this.stakeAllocator.unallocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('0');
            });

            it('burns from unallocated', async function () {
                const staked = '3000';
                await this.staking.connect(this.accounts.user1).deposit(nodeRunnerSubjectType, nodeRunnerId, staked);
                await this.stakeAllocator.connect(this.accounts.user1).unallocateOwnStake(nodeRunnerSubjectType, nodeRunnerId, '3000');
                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('3000');
                expect(await this.stakeAllocator.allocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('0');
                expect(await this.stakeAllocator.unallocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('3000');
                await expect(this.staking.connect(this.accounts.user1).initiateWithdrawal(nodeRunnerSubjectType, nodeRunnerId, '2500'))
                    .to.emit(this.stakeAllocator, 'UnallocatedStake')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, false, '2500', '500');
                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('500');
                expect(await this.stakeAllocator.allocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('0');
                expect(await this.stakeAllocator.unallocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('500');
            });
        });

        describe('On Slashing', function () {
            it('burns from unallocated and allocated', async function () {
                const staked = '3000';
                await this.staking.connect(this.accounts.user1).deposit(nodeRunnerSubjectType, nodeRunnerId, staked);
                await this.stakeAllocator.connect(this.accounts.user1).unallocateOwnStake(nodeRunnerSubjectType, nodeRunnerId, '2000');
                await this.nodeRunners.connect(this.accounts.manager).setManagedStakeThreshold({ max: '100000', min: '333', activated: true }, 1);
                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('3000');
                expect(await this.stakeAllocator.allocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('1000');
                expect(await this.stakeAllocator.unallocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('2000');
                expect(await this.nodeRunners.isScannerOperational(SCANNERS[0].address)).to.eq(true);
                await this.access.connect(this.accounts.admin).grantRole(this.roles.SLASHER, this.accounts.admin.address);
                await expect(this.staking.connect(this.accounts.admin).slash(nodeRunnerSubjectType, nodeRunnerId, '2500', this.accounts.user1.address, 0))
                    .to.emit(this.stakeAllocator, 'UnallocatedStake')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, false, '2000', 0)
                    .to.emit(this.stakeAllocator, 'AllocatedStake')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, false, '500', '500');
                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('500');
                expect(await this.stakeAllocator.allocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('500');
                expect(await this.stakeAllocator.unallocatedStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.eq('0');
                expect(await this.nodeRunners.isScannerOperational(SCANNERS[0].address)).to.eq(false);
            });
        });
    });

    describe('Deposit / Withdraw', function () {
        describe('Delegated', function () {
            const DELAY = 86400;
            beforeEach(async function () {
                await expect(this.staking.setDelay(DELAY)).to.emit(this.staking, 'DelaySet').withArgs(DELAY);
            });

            it('happy path', async function () {
                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.be.equal('0');
                expect(await this.staking.totalActiveStake()).to.be.equal('0');
                expect(await this.staking.sharesOf(nodeRunnerSubjectType, nodeRunnerId, this.accounts.user1.address)).to.be.equal('0');
                expect(await this.staking.totalShares(nodeRunnerSubjectType, nodeRunnerId)).to.be.equal('0');

                await expect(this.staking.connect(this.accounts.user1).deposit(nodeRunnerSubjectType, nodeRunnerId, '100'))
                    .to.emit(this.token, 'Transfer')
                    .withArgs(this.accounts.user1.address, this.staking.address, '100')
                    .to.emit(this.staking, 'TransferSingle')
                    .withArgs(this.accounts.user1.address, ethers.constants.AddressZero, this.accounts.user1.address, nodeRunnerActive, '100')
                    .to.emit(this.staking, 'StakeDeposited')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, this.accounts.user1.address, '100');

                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.be.equal('100');
                expect(await this.staking.totalActiveStake()).to.be.equal('100');
                expect(await this.staking.sharesOf(nodeRunnerSubjectType, nodeRunnerId, this.accounts.user1.address)).to.be.equal('100');
                expect(await this.staking.totalShares(nodeRunnerSubjectType, nodeRunnerId)).to.be.equal('100');

                await expect(this.staking.connect(this.accounts.user1).withdraw(nodeRunnerSubjectType, nodeRunnerId)).to.be.reverted;

                const tx1 = await this.staking.connect(this.accounts.user1).initiateWithdrawal(nodeRunnerSubjectType, nodeRunnerId, '50');
                await expect(tx1)
                    .to.emit(this.staking, 'WithdrawalInitiated')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, this.accounts.user1.address, (await txTimestamp(tx1)) + DELAY)
                    .to.emit(this.staking, 'TransferSingle');

                await expect(this.staking.connect(this.accounts.user1).withdraw(nodeRunnerSubjectType, nodeRunnerId)).to.be.reverted;

                await network.provider.send('evm_increaseTime', [DELAY]);

                await expect(this.staking.connect(this.accounts.user1).withdraw(nodeRunnerSubjectType, nodeRunnerId))
                    .to.emit(this.token, 'Transfer')
                    .withArgs(this.staking.address, this.accounts.user1.address, '50')
                    .to.emit(this.staking, 'TransferSingle')
                    .withArgs(this.accounts.user1.address, this.accounts.user1.address, ethers.constants.AddressZero, nodeRunnerInactive, '50')
                    .to.emit(this.staking, 'WithdrawalExecuted')
                    .withArgs(nodeRunnerSubjectType, nodeRunnerId, this.accounts.user1.address);

                expect(await this.staking.activeStakeFor(nodeRunnerSubjectType, nodeRunnerId)).to.be.equal('50');
                expect(await this.staking.totalActiveStake()).to.be.equal('50');
                expect(await this.staking.sharesOf(nodeRunnerSubjectType, nodeRunnerId, this.accounts.user1.address)).to.be.equal('50');
                expect(await this.staking.totalShares(nodeRunnerSubjectType, nodeRunnerId)).to.be.equal('50');
            });
        });

        describe('Delegator', function () {});
    });
});
