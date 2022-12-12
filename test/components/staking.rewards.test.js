const { ethers, network } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const { prepare } = require('../fixture');
const { subjectToActive, subjectToInactive } = require('../../scripts/utils/staking.js');
const { signERC712ScannerRegistration } = require('../../scripts/utils/scannerRegistration');

const subjects = [
    [ethers.BigNumber.from(ethers.utils.id('135a782d-c263-43bd-b70b-920873ed7e9d')), 1], // Agent id, agent type
    [ethers.BigNumber.from('1'), 2], // ScannerPool id, ScannerPool Type
];
const DELEGATOR_SUBJECT_TYPE = 3;

const EPOCH_LENGTH = 7 * 24 * 60 * 60;

const [[subject1, subjectType1, active1, inactive1], [SCANNER_POOL_ID, SCANNER_POOL_SUBJECT_TYPE, active2, inactive2]] = subjects.map((items) => [
    items[0],
    items[1],
    subjectToActive(items[1], items[0]),
    subjectToInactive(items[1], items[0]),
]);

const MAX_STAKE = '10000';
const OFFSET = 4 * 24 * 60 * 60;
let registration, signature, verifyingContractInfo;
describe('Staking Rewards', function () {
    prepare({
        stake: {
            agents: { min: '1', max: MAX_STAKE, activated: true },
            scanners: { min: '1', max: MAX_STAKE, activated: true },
        },
    });
    beforeEach(async function () {
        await this.token.connect(this.accounts.minter).mint(this.accounts.user1.address, '1000');
        await this.token.connect(this.accounts.minter).mint(this.accounts.user2.address, '1000');
        await this.token.connect(this.accounts.minter).mint(this.accounts.user3.address, '1000');
        await this.token.connect(this.accounts.minter).mint(this.contracts.rewardsDistributor.address, '100000000');

        await this.token.connect(this.accounts.user1).approve(this.staking.address, ethers.constants.MaxUint256);
        await this.token.connect(this.accounts.user2).approve(this.staking.address, ethers.constants.MaxUint256);
        await this.token.connect(this.accounts.user3).approve(this.staking.address, ethers.constants.MaxUint256);

        const args = [subject1, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5]];
        await this.agents.connect(this.accounts.other).createAgent(...args);
        await this.scannerPools.connect(this.accounts.user1).registerScannerPool(1);

        this.accounts.getAccount('slasher');
        await this.access.connect(this.accounts.admin).grantRole(this.roles.SLASHER, this.accounts.slasher.address);

        this.accounts.getAccount('scanner');
        this.SCANNER_ID = this.accounts.scanner.address;
        const { chainId } = await ethers.provider.getNetwork();
        verifyingContractInfo = {
            address: this.contracts.scannerPools.address,
            chainId: chainId,
        };
        registration = {
            scanner: this.SCANNER_ID,
            scannerPoolId: 1,
            chainId: 1,
            metadata: 'metadata',
            timestamp: (await ethers.provider.getBlock('latest')).timestamp,
        };
        signature = await signERC712ScannerRegistration(verifyingContractInfo, registration, this.accounts.scanner);
    });

    describe('Rewards tracking stake allocation', function () {
        beforeEach(async function () {
            const delay = await this.rewardsDistributor.delegationParamsEpochDelay();
            await this.rewardsDistributor.connect(this.accounts.admin).setDelegationParams(delay, 0);
        });

        it('should not allow rewarding twice', async function () {
            const epoch = await this.rewardsDistributor.getCurrentEpochNumber();
            await helpers.time.increase(1 + EPOCH_LENGTH /* 1 week */);
            await this.rewardsDistributor.connect(this.accounts.manager).reward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '2000', epoch);
            await expect(this.rewardsDistributor.connect(this.accounts.manager).reward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '2000', epoch)).to.be.revertedWith(
                `AlreadyRewarded(${epoch})`
            );
        });

        it('should apply equal rewards with comission for stakes added at the same time', async function () {
            // disable automine so deposits are instantaneous to simplify math
            await network.provider.send('evm_setAutomine', [false]);
            await this.staking.connect(this.accounts.user1).deposit(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '100');
            await this.scannerPools.connect(this.accounts.user1).registerScannerNode(registration, signature);
            await this.staking.connect(this.accounts.user2).deposit(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, '50');
            await network.provider.send('evm_setAutomine', [true]);
            await network.provider.send('evm_mine');

            expect(await this.stakeAllocator.allocatedManagedStake(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('150');

            const latestTimestamp = await helpers.time.latest();
            const timeToNextEpoch = EPOCH_LENGTH - ((latestTimestamp - OFFSET) % EPOCH_LENGTH);
            await helpers.time.increase(Math.floor(timeToNextEpoch / 2));

            await this.staking.connect(this.accounts.user3).deposit(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, '100');

            const epoch = await this.rewardsDistributor.getCurrentEpochNumber();

            await helpers.time.increase(1 + EPOCH_LENGTH /* 1 week */);

            expect(await this.rewardsDistributor.availableReward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user1.address)).to.be.equal('0');
            expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user2.address)).to.be.equal('0');

            await this.rewardsDistributor.connect(this.accounts.manager).reward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '2000', epoch);

            expect(await this.rewardsDistributor.availableReward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user1.address)).to.be.equal('1000');
            expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user2.address)).to.be.closeTo('500', '1');
            expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user3.address)).to.be.closeTo('500', '1');

            const balanceBefore1 = await this.token.balanceOf(this.accounts.user1.address);
            const balanceBefore2 = await this.token.balanceOf(this.accounts.user2.address);

            await this.rewardsDistributor.connect(this.accounts.user1).claimRewards(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, [epoch]);
            await this.rewardsDistributor.connect(this.accounts.user2).claimRewards(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, [epoch]);

            expect(await this.token.balanceOf(this.accounts.user1.address)).to.eq(balanceBefore1.add('1000'));
            expect(await this.token.balanceOf(this.accounts.user2.address)).to.be.closeTo(balanceBefore2.add('500'), 1);

            expect(await this.rewardsDistributor.availableReward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user1.address)).to.be.equal('0');
            expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user2.address)).to.be.equal('0');

            await expect(this.rewardsDistributor.connect(this.accounts.user1).claimRewards(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, [epoch])).to.be.revertedWith(
                'AlreadyClaimed()'
            );
            await expect(this.rewardsDistributor.connect(this.accounts.user2).claimRewards(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, [epoch])).to.be.revertedWith(
                'AlreadyClaimed()'
            );
        });

        it('should fail to reclaim if no rewards available', async function () {
            await expect(this.rewardsDistributor.connect(this.accounts.user1).claimRewards(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, [1])).to.be.revertedWith(
                'ZeroAmount("epochRewards")'
            );
        });


        it('remove stake', async function () {
            // disable automine so deposits are instantaneous to simplify math
            await network.provider.send('evm_setAutomine', [false]);
            await this.staking.connect(this.accounts.user1).deposit(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '100');
            await this.scannerPools.connect(this.accounts.user1).registerScannerNode(registration, signature);
            await this.staking.connect(this.accounts.user2).deposit(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, '100');
            await network.provider.send('evm_setAutomine', [true]);
            await network.provider.send('evm_mine');

            expect(await this.stakeAllocator.allocatedManagedStake(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('200');

            const latestTimestamp = await helpers.time.latest();
            const timeToNextEpoch = EPOCH_LENGTH - ((latestTimestamp - OFFSET) % EPOCH_LENGTH);
            await helpers.time.increase(Math.floor(timeToNextEpoch / 2));

            const epoch = await this.rewardsDistributor.getCurrentEpochNumber();

            await this.staking.connect(this.accounts.user2).initiateWithdrawal(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, '100');

            expect(await this.stakeAllocator.allocatedManagedStake(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('100');

            await helpers.time.increase(1 + EPOCH_LENGTH /* 1 week */);

            expect(await this.rewardsDistributor.availableReward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user1.address)).to.be.equal('0');
            expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user2.address)).to.be.equal('0');

            await this.rewardsDistributor.connect(this.accounts.manager).reward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '1500', epoch);

            expect(await this.rewardsDistributor.availableReward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user1.address)).to.be.closeTo('1000', '1');
            expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user2.address)).to.be.closeTo('500', '1');

            await this.rewardsDistributor.connect(this.accounts.user1).claimRewards(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, [epoch]);
            await this.rewardsDistributor.connect(this.accounts.user2).claimRewards(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, [epoch]);
        });

        it('slash stake', async function () {
            // disable automine so deposits are instantaneous to simplify math
            await network.provider.send('evm_setAutomine', [false]);
            await this.staking.connect(this.accounts.user1).deposit(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '100');
            await this.scannerPools.connect(this.accounts.user1).registerScannerNode(registration, signature);
            await this.staking.connect(this.accounts.user2).deposit(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, '100');
            await network.provider.send('evm_setAutomine', [true]);
            await network.provider.send('evm_mine');

            expect(await this.stakeAllocator.allocatedManagedStake(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('200');

            const latestTimestamp = await helpers.time.latest();
            const timeToNextEpoch = EPOCH_LENGTH - ((latestTimestamp - OFFSET) % EPOCH_LENGTH);
            await helpers.time.increase(Math.floor(timeToNextEpoch / 2));

            const epoch = await this.rewardsDistributor.getCurrentEpochNumber();

            await this.staking.connect(this.accounts.admin).setSlashDelegatorsPercent('20');
            await this.staking.connect(this.accounts.slasher).slash(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '20', ethers.constants.AddressZero, '0');

            expect(await this.stakeAllocator.allocatedManagedStake(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('180');
            expect(await this.stakeAllocator.allocatedStakeFor(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('84');
            expect(await this.stakeAllocator.allocatedStakeFor(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('96');

            await helpers.time.increase(1 + EPOCH_LENGTH /* 1 week */);

            expect(await this.rewardsDistributor.availableReward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user1.address)).to.be.equal('0');
            expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user2.address)).to.be.equal('0');

            await this.rewardsDistributor.connect(this.accounts.manager).reward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '1000', epoch);

            expect(await this.rewardsDistributor.availableReward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user1.address)).to.be.closeTo('484', '1');
            expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user2.address)).to.be.closeTo('516', '1');

            await this.rewardsDistributor.connect(this.accounts.user1).claimRewards(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, [epoch]);
            await this.rewardsDistributor.connect(this.accounts.user2).claimRewards(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, [epoch]);
        });

        it('unallocate stake', async function () {
            // disable automine so deposits are instantaneous to simplify math
            await network.provider.send('evm_setAutomine', [false]);
            await this.staking.connect(this.accounts.user1).deposit(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '100');
            await this.scannerPools.connect(this.accounts.user1).registerScannerNode(registration, signature);
            await this.staking.connect(this.accounts.user2).deposit(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, '100');
            await network.provider.send('evm_setAutomine', [true]);
            await network.provider.send('evm_mine');

            expect(await this.stakeAllocator.allocatedManagedStake(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('200');

            const latestTimestamp = await helpers.time.latest();
            const timeToNextEpoch = EPOCH_LENGTH - ((latestTimestamp - OFFSET) % EPOCH_LENGTH);
            await helpers.time.increase(Math.floor(timeToNextEpoch / 2));

            const epoch = await this.rewardsDistributor.getCurrentEpochNumber();

            await this.stakeAllocator.connect(this.accounts.user1).unallocateDelegatorStake(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '100');

            expect(await this.stakeAllocator.allocatedManagedStake(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('100');
            expect(await this.stakeAllocator.allocatedStakeFor(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('100');
            expect(await this.stakeAllocator.allocatedStakeFor(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('0');

            await helpers.time.increase(1 + EPOCH_LENGTH /* 1 week */);

            expect(await this.rewardsDistributor.availableReward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user1.address)).to.be.equal('0');
            expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user2.address)).to.be.equal('0');

            await this.rewardsDistributor.connect(this.accounts.manager).reward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '1500', epoch);

            expect(await this.rewardsDistributor.availableReward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user1.address)).to.be.closeTo('1000', '1');
            expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user2.address)).to.be.closeTo('500', '1');

            await this.rewardsDistributor.connect(this.accounts.user1).claimRewards(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, [epoch]);
            await this.rewardsDistributor.connect(this.accounts.user2).claimRewards(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, [epoch]);
        });

        it('allocate stake', async function () {
            // disable automine so deposits are instantaneous to simplify math
            await network.provider.send('evm_setAutomine', [false]);
            await this.staking.connect(this.accounts.user1).deposit(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '100');
            await this.scannerPools.connect(this.accounts.user1).registerScannerNode(registration, signature);
            await this.staking.connect(this.accounts.user2).deposit(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, '100');
            await network.provider.send('evm_setAutomine', [true]);
            await network.provider.send('evm_mine');
            await this.stakeAllocator.connect(this.accounts.user1).unallocateDelegatorStake(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '100');

            expect(await this.stakeAllocator.allocatedStakeFor(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('100');
            expect(await this.stakeAllocator.allocatedStakeFor(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('0');
            expect(await this.stakeAllocator.allocatedManagedStake(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('100');

            const latestTimestamp = await helpers.time.latest();
            const timeToNextEpoch = EPOCH_LENGTH - ((latestTimestamp - OFFSET) % EPOCH_LENGTH);
            await helpers.time.increase(Math.floor(timeToNextEpoch / 2));

            const epoch = await this.rewardsDistributor.getCurrentEpochNumber();

            await this.stakeAllocator.connect(this.accounts.user1).allocateDelegatorStake(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '100');

            expect(await this.stakeAllocator.allocatedManagedStake(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('200');
            expect(await this.stakeAllocator.allocatedStakeFor(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('100');
            expect(await this.stakeAllocator.allocatedStakeFor(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('100');

            await helpers.time.increase(1 + EPOCH_LENGTH /* 1 week */);

            expect(await this.rewardsDistributor.availableReward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user1.address)).to.be.equal('0');
            expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user2.address)).to.be.equal('0');

            await this.rewardsDistributor.connect(this.accounts.manager).reward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '1500', epoch);

            expect(await this.rewardsDistributor.availableReward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user1.address)).to.be.closeTo('1000', '1');
            expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user2.address)).to.be.closeTo('500', '1');

            await this.rewardsDistributor.connect(this.accounts.user1).claimRewards(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, [epoch]);
            await this.rewardsDistributor.connect(this.accounts.user2).claimRewards(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, [epoch]);
        });

        it('allocate stake ScannerPool', async function () {
            // disable automine so deposits are instantaneous to simplify math
            await network.provider.send('evm_setAutomine', [false]);
            await this.staking.connect(this.accounts.user1).deposit(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '100');
            await this.scannerPools.connect(this.accounts.user1).registerScannerNode(registration, signature);
            await this.staking.connect(this.accounts.user2).deposit(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, '100');

            await network.provider.send('evm_setAutomine', [true]);
            await network.provider.send('evm_mine');
            await this.stakeAllocator.connect(this.accounts.user1).unallocateOwnStake(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '50');

            expect(await this.stakeAllocator.allocatedManagedStake(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('150');

            const latestTimestamp = await helpers.time.latest();
            const timeToNextEpoch = EPOCH_LENGTH - ((latestTimestamp - OFFSET) % EPOCH_LENGTH);
            await helpers.time.increase(Math.floor(timeToNextEpoch / 2));

            const epoch = await this.rewardsDistributor.getCurrentEpochNumber();

            await this.stakeAllocator.connect(this.accounts.user1).allocateOwnStake(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '50');

            expect(await this.stakeAllocator.allocatedManagedStake(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('200');
            expect(await this.stakeAllocator.allocatedStakeFor(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('100');
            expect(await this.stakeAllocator.allocatedStakeFor(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('100');

            await helpers.time.increase(1 + EPOCH_LENGTH /* 1 week */);

            expect(await this.rewardsDistributor.availableReward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user1.address)).to.be.equal('0');
            expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user2.address)).to.be.equal('0');

            await this.rewardsDistributor.connect(this.accounts.manager).reward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '1000', epoch);

            expect(await this.rewardsDistributor.availableReward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user1.address)).to.be.closeTo('428', '1');
            expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user2.address)).to.be.closeTo('571', '1');

            await this.rewardsDistributor.connect(this.accounts.user1).claimRewards(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, [epoch]);
            await this.rewardsDistributor.connect(this.accounts.user2).claimRewards(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, [epoch]);
        });

        it('share transfer ', async function () {
            // disable automine so deposits are instantaneous to simplify math
            await network.provider.send('evm_setAutomine', [false]);
            await this.staking.connect(this.accounts.user1).deposit(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '100');
            await this.scannerPools.connect(this.accounts.user1).registerScannerNode(registration, signature);
            await this.staking.connect(this.accounts.user2).deposit(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, '100');
            await network.provider.send('evm_setAutomine', [true]);
            await network.provider.send('evm_mine');

            expect(await this.stakeAllocator.allocatedManagedStake(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('200');

            const latestTimestamp = await helpers.time.latest();
            const timeToNextEpoch = EPOCH_LENGTH - ((latestTimestamp - OFFSET) % EPOCH_LENGTH);
            await helpers.time.increase(Math.floor(timeToNextEpoch / 2));

            const epoch = await this.rewardsDistributor.getCurrentEpochNumber();

            const delegatorShares = subjectToActive(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID);
            await this.staking.connect(this.accounts.user2).safeTransferFrom(this.accounts.user2.address, this.accounts.user3.address, delegatorShares, '50', '0x');

            expect(await this.stakeAllocator.allocatedManagedStake(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('200');
            expect(await this.stakeAllocator.allocatedStakeFor(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('100');
            expect(await this.stakeAllocator.allocatedStakeFor(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('100');

            await helpers.time.increase(1 + EPOCH_LENGTH /* 1 week */);

            expect(await this.rewardsDistributor.availableReward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user1.address)).to.be.equal('0');
            expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user2.address)).to.be.equal('0');

            await this.rewardsDistributor.connect(this.accounts.manager).reward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '1000', epoch);

            expect(await this.rewardsDistributor.availableReward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user1.address)).to.be.closeTo('500', '1');
            expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user2.address)).to.be.closeTo('375', '1');
            expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user3.address)).to.be.closeTo('125', '1');

            await this.rewardsDistributor.connect(this.accounts.user1).claimRewards(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, [epoch]);
            await this.rewardsDistributor.connect(this.accounts.user2).claimRewards(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, [epoch]);
        });
    });

    describe('Fee setting', function () {
        it('fee', async function () {
            await this.rewardsDistributor.connect(this.accounts.user1).setDelegationFeeBps(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '2500');
            let currentEpoch = await this.rewardsDistributor.getCurrentEpochNumber();
            console.log(await this.rewardsDistributor.getDelegationFee(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, currentEpoch));

            await helpers.time.increase(2 * (1 + EPOCH_LENGTH) /* 2 week */);
            currentEpoch = await this.rewardsDistributor.getCurrentEpochNumber();
            console.log(await this.rewardsDistributor.getDelegationFee(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, currentEpoch));
            const registration = {
                scanner: this.SCANNER_ID,
                scannerPoolId: 1,
                chainId: 1,
                metadata: 'metadata',
                timestamp: (await ethers.provider.getBlock('latest')).timestamp,
            };
            const signature = await signERC712ScannerRegistration(verifyingContractInfo, registration, this.accounts.scanner);
            // disable automine so deposits are instantaneous to simplify math
            await network.provider.send('evm_setAutomine', [false]);
            await this.staking.connect(this.accounts.user1).deposit(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '100');
            await this.scannerPools.connect(this.accounts.user1).registerScannerNode(registration, signature);
            await this.staking.connect(this.accounts.user2).deposit(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, '100');

            await network.provider.send('evm_setAutomine', [true]);
            await network.provider.send('evm_mine');

            expect(await this.stakeAllocator.allocatedManagedStake(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID)).to.be.equal('200');

            const epoch = await this.rewardsDistributor.getCurrentEpochNumber();

            await helpers.time.increase(1 + EPOCH_LENGTH /* 1 week */);

            expect(await this.rewardsDistributor.availableReward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user1.address)).to.be.equal('0');
            expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user2.address)).to.be.equal('0');

            await this.rewardsDistributor.connect(this.accounts.manager).reward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '2000', epoch);

            expect(await this.rewardsDistributor.availableReward(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user1.address)).to.be.equal('1250');
            expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, epoch, this.accounts.user2.address)).to.be.equal('750');

            await this.rewardsDistributor.connect(this.accounts.user1).claimRewards(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, [epoch]);
            await this.rewardsDistributor.connect(this.accounts.user2).claimRewards(DELEGATOR_SUBJECT_TYPE, SCANNER_POOL_ID, [epoch]);
        });
        it('fee can only be set by ScannerPool', async function () {
            await expect(this.rewardsDistributor.connect(this.accounts.user2).setDelegationFeeBps(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '2500')).to.be.revertedWith(
                `SenderNotOwner("${this.accounts.user2.address}", ${SCANNER_POOL_ID})`
            );
        });
        it('fee is in effect next period after setting', async function () {
            const defaultRate = await this.rewardsDistributor.defaultFeeBps();
            let currentEpoch = await this.rewardsDistributor.getCurrentEpochNumber();
            await this.rewardsDistributor.connect(this.accounts.user1).setDelegationFeeBps(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '2500');
            // fee still not in effect
            expect(await this.rewardsDistributor.getDelegationFee(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, currentEpoch)).to.be.eq(defaultRate);

            await helpers.time.increase(1 + EPOCH_LENGTH /* 1 week */);

            currentEpoch = await this.rewardsDistributor.getCurrentEpochNumber();
            expect(await this.rewardsDistributor.getDelegationFee(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, currentEpoch)).to.be.eq('2500');

            await helpers.time.increase(2 * (1 + EPOCH_LENGTH) /* 2 week */);
            await this.rewardsDistributor.connect(this.accounts.user1).setDelegationFeeBps(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '3000');
            currentEpoch = await this.rewardsDistributor.getCurrentEpochNumber();
            expect(await this.rewardsDistributor.getDelegationFee(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, currentEpoch)).to.be.eq('2500');

            await helpers.time.increase(1 + EPOCH_LENGTH /* 1 week */);

            currentEpoch = await this.rewardsDistributor.getCurrentEpochNumber();
            expect(await this.rewardsDistributor.getDelegationFee(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, currentEpoch)).to.be.eq('3000');
        });

        it('there is a cooldown period for fees', async function () {
            await this.rewardsDistributor.connect(this.accounts.user1).setDelegationFeeBps(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '2500');
            await expect(this.rewardsDistributor.connect(this.accounts.user1).setDelegationFeeBps(SCANNER_POOL_SUBJECT_TYPE, SCANNER_POOL_ID, '3000')).to.be.revertedWith(
                'SetDelegationFeeNotReady()'
            );
        });
    });
});
