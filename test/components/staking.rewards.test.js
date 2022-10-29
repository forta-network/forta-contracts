const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const { prepare } = require('../fixture');
const { subjectToActive, subjectToInactive } = require('../../scripts/utils/staking.js');
const { signERC712ScannerRegistration } = require('../../scripts/utils/scannerRegistration');

const subjects = [
    [ethers.BigNumber.from(ethers.utils.id('135a782d-c263-43bd-b70b-920873ed7e9d')), 1], // Agent id, agent type
    [ethers.BigNumber.from('1'), 2], // Node Runner id, Node Runner Type
];
const DELEGATOR_SUBJECT_TYPE = 3;

const EPOCH_LENGTH = 7 * 24 * 60 * 60;

const [[subject1, subjectType1, active1, inactive1], [NODE_RUNNER_ID, NODE_RUNNER_SUBJECT_TYPE, active2, inactive2]] = subjects.map((items) => [
    items[0],
    items[1],
    subjectToActive(items[1], items[0]),
    subjectToInactive(items[1], items[0]),
]);

const MAX_STAKE = '10000';

describe('Forta Staking General', function () {
    prepare({
        stake: {
            agents: { min: '1', max: MAX_STAKE, activated: true },
            scanners: { min: '1', max: MAX_STAKE, activated: true },
        },
    });
    beforeEach(async function () {
        await this.token.connect(this.accounts.minter).mint(this.accounts.user1.address, ethers.utils.parseEther('1000'));
        await this.token.connect(this.accounts.minter).mint(this.accounts.user2.address, ethers.utils.parseEther('1000'));
        await this.token.connect(this.accounts.minter).mint(this.accounts.user3.address, ethers.utils.parseEther('1000'));
        await this.token.connect(this.accounts.minter).mint(this.contracts.rewardsDistributor.address, ethers.utils.parseEther('100000000'));

        await this.token.connect(this.accounts.user1).approve(this.staking.address, ethers.constants.MaxUint256);
        await this.token.connect(this.accounts.user2).approve(this.staking.address, ethers.constants.MaxUint256);
        await this.token.connect(this.accounts.user3).approve(this.staking.address, ethers.constants.MaxUint256);

        const args = [subject1, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5]];
        await this.agents.connect(this.accounts.other).createAgent(...args);
        await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner(1);

        this.accounts.getAccount('scanner');
        this.SCANNER_ID = this.accounts.scanner.address;
        const { chainId } = await ethers.provider.getNetwork();
        const verifyingContractInfo = {
            address: this.contracts.nodeRunners.address,
            chainId: chainId,
        };
        const registration = {
            scanner: this.SCANNER_ID,
            nodeRunnerId: 1,
            chainId: 1,
            metadata: 'metadata',
            timestamp: (await ethers.provider.getBlock('latest')).timestamp,
        };
        const signature = await signERC712ScannerRegistration(verifyingContractInfo, registration, this.accounts.scanner);

        await this.nodeRunners.connect(this.accounts.user1).registerScannerNode(registration, signature);
    });

    it.only('should apply equal rewards with comission for stakes added at the same time', async function () {
        // disable automine so deposits are instantaneous to simplify math
        await network.provider.send('evm_setAutomine', [false]);
        await this.staking.connect(this.accounts.user1).deposit(NODE_RUNNER_SUBJECT_TYPE, NODE_RUNNER_ID, '100');
        await this.staking.connect(this.accounts.user2).deposit(DELEGATOR_SUBJECT_TYPE, NODE_RUNNER_ID, '50');
        await network.provider.send('evm_setAutomine', [true]);
        await network.provider.send('evm_mine');

        expect(await this.stakeAllocator.allocatedManagedStake(NODE_RUNNER_SUBJECT_TYPE, NODE_RUNNER_ID)).to.be.equal('150');

        const latestTimestamp = await helpers.time.latest();
        const timeToNextEpoch = EPOCH_LENGTH - (latestTimestamp % EPOCH_LENGTH);
        await helpers.time.increase(Math.floor(timeToNextEpoch / 2));

        await this.staking.connect(this.accounts.user3).deposit(DELEGATOR_SUBJECT_TYPE, NODE_RUNNER_ID, '100');

        const epoch = await this.rewardsDistributor.getEpochNumber();

        await helpers.time.increase(1 + EPOCH_LENGTH /* 1 week */);

        expect(await this.rewardsDistributor.availableReward(NODE_RUNNER_SUBJECT_TYPE, NODE_RUNNER_ID, epoch, this.accounts.user1.address)).to.be.equal('0');
        expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, NODE_RUNNER_ID, epoch, this.accounts.user2.address)).to.be.equal('0');

        await this.rewardsDistributor.connect(this.accounts.manager).reward(NODE_RUNNER_SUBJECT_TYPE, NODE_RUNNER_ID, '2000', epoch);

        expect(await this.rewardsDistributor.availableReward(NODE_RUNNER_SUBJECT_TYPE, NODE_RUNNER_ID, epoch, this.accounts.user1.address)).to.be.equal('1000');
        expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, NODE_RUNNER_ID, epoch, this.accounts.user2.address)).to.be.closeTo('500', '1');
        expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, NODE_RUNNER_ID, epoch, this.accounts.user3.address)).to.be.closeTo('500', '1');

        await this.rewardsDistributor.connect(this.accounts.user1).claimRewards(NODE_RUNNER_SUBJECT_TYPE, NODE_RUNNER_ID, epoch);
        await this.rewardsDistributor.connect(this.accounts.user2).claimRewards(DELEGATOR_SUBJECT_TYPE, NODE_RUNNER_ID, epoch);

        expect(await this.rewardsDistributor.availableReward(NODE_RUNNER_SUBJECT_TYPE, NODE_RUNNER_ID, epoch, this.accounts.user1.address)).to.be.equal('0');
        expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, NODE_RUNNER_ID, epoch, this.accounts.user2.address)).to.be.equal('0');

        await expect(this.rewardsDistributor.connect(this.accounts.user1).claimRewards(NODE_RUNNER_SUBJECT_TYPE, NODE_RUNNER_ID, epoch)).to.be.revertedWith('AlreadyClaimed()');
        await expect(this.rewardsDistributor.connect(this.accounts.user2).claimRewards(DELEGATOR_SUBJECT_TYPE, NODE_RUNNER_ID, epoch)).to.be.revertedWith('AlreadyClaimed()');
    });

    it.only('remove stake', async function() {
        // disable automine so deposits are instantaneous to simplify math
        await network.provider.send('evm_setAutomine', [false]);
        await this.staking.connect(this.accounts.user1).deposit(NODE_RUNNER_SUBJECT_TYPE, NODE_RUNNER_ID, '100');
        await this.staking.connect(this.accounts.user2).deposit(DELEGATOR_SUBJECT_TYPE, NODE_RUNNER_ID, '100');
        await network.provider.send('evm_setAutomine', [true]);
        await network.provider.send('evm_mine');

        expect(await this.stakeAllocator.allocatedManagedStake(NODE_RUNNER_SUBJECT_TYPE, NODE_RUNNER_ID)).to.be.equal('200');

        const latestTimestamp = await helpers.time.latest();
        const timeToNextEpoch = EPOCH_LENGTH - (latestTimestamp % EPOCH_LENGTH);
        await helpers.time.increase(Math.floor(timeToNextEpoch / 2));

        const epoch = await this.rewardsDistributor.getEpochNumber();

        await this.staking.connect(this.accounts.user2).initiateWithdrawal(DELEGATOR_SUBJECT_TYPE, NODE_RUNNER_ID, '100');

        expect(await this.stakeAllocator.allocatedManagedStake(NODE_RUNNER_SUBJECT_TYPE, NODE_RUNNER_ID)).to.be.equal('100');

        await helpers.time.increase(1 + EPOCH_LENGTH /* 1 week */);

        expect(await this.rewardsDistributor.availableReward(NODE_RUNNER_SUBJECT_TYPE, NODE_RUNNER_ID, epoch, this.accounts.user1.address)).to.be.equal('0');
        expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, NODE_RUNNER_ID, epoch, this.accounts.user2.address)).to.be.equal('0');

        await this.rewardsDistributor.connect(this.accounts.manager).reward(NODE_RUNNER_SUBJECT_TYPE, NODE_RUNNER_ID, '1500', epoch);

        expect(await this.rewardsDistributor.availableReward(NODE_RUNNER_SUBJECT_TYPE, NODE_RUNNER_ID, epoch, this.accounts.user1.address)).to.be.closeTo('1000', '1');
        expect(await this.rewardsDistributor.availableReward(DELEGATOR_SUBJECT_TYPE, NODE_RUNNER_ID, epoch, this.accounts.user2.address)).to.be.closeTo( '500', '1');

        await this.rewardsDistributor.connect(this.accounts.user1).claimRewards(NODE_RUNNER_SUBJECT_TYPE, NODE_RUNNER_ID, epoch);
        await this.rewardsDistributor.connect(this.accounts.user2).claimRewards(DELEGATOR_SUBJECT_TYPE, NODE_RUNNER_ID, epoch);
    });

    it('slash');
    it('commission');

    describe.skip('Rewards', function () {
        it('cannot reward to invalid subjectType', async function () {
            await expect(this.staking.connect(this.accounts.user1).reward(9, subject1, '10')).to.be.revertedWith('InvalidSubjectType(9)');
        });

        it('can reward to direct subject for an epoch', async function () {
            await expect(this.staking.connect(this.accounts.user1).reward(subjectType1, subject1, '10'))
                .to.emit(this.staking, 'Rewarded')
                .withArgs(subjectType1, subject1, this.accounts.user1.address, '10');
        });

        it('fix shares', async function () {
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '100')).to.be.not.reverted;
            await expect(this.staking.connect(this.accounts.user2).deposit(subjectType1, subject1, '50')).to.be.not.reverted;

            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('100');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('50');
            expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('150');

            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');
            await expect(this.staking.releaseReward(subjectType1, subject1, this.accounts.user1.address))
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.user1.address, '0')
                .to.emit(this.staking, 'Released')
                .withArgs(subjectType1, subject1, this.accounts.user1.address, '0');

            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');
            await expect(this.staking.releaseReward(subjectType1, subject1, this.accounts.user2.address))
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.user2.address, '0')
                .to.emit(this.staking, 'Released')
                .withArgs(subjectType1, subject1, this.accounts.user2.address, '0');

            await expect(this.staking.connect(this.accounts.user3).reward(subjectType1, subject1, '60'))
                .to.emit(this.staking, 'Rewarded')
                .withArgs(subjectType1, subject1, this.accounts.user3.address, '60');

            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('40');
            await expect(this.staking.releaseReward(subjectType1, subject1, this.accounts.user1.address))
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.user1.address, '40')
                .to.emit(this.staking, 'Released')
                .withArgs(subjectType1, subject1, this.accounts.user1.address, '40');

            await expect(this.staking.connect(this.accounts.user3).reward(subjectType1, subject1, '15'))
                .to.emit(this.staking, 'Rewarded')
                .withArgs(subjectType1, subject1, this.accounts.user3.address, '15');

            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('10');
            await expect(this.staking.releaseReward(subjectType1, subject1, this.accounts.user1.address))
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.user1.address, '10')
                .to.emit(this.staking, 'Released')
                .withArgs(subjectType1, subject1, this.accounts.user1.address, '10');

            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('25');
            await expect(this.staking.releaseReward(subjectType1, subject1, this.accounts.user2.address))
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.user2.address, '25')
                .to.emit(this.staking, 'Released')
                .withArgs(subjectType1, subject1, this.accounts.user2.address, '25');
        });

        it('increassing shares', async function () {
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '50')).to.be.not.reverted;
            await expect(this.staking.connect(this.accounts.user2).deposit(subjectType1, subject1, '50')).to.be.not.reverted;

            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');
            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('0');

            await expect(this.staking.connect(this.accounts.user3).reward(subjectType1, subject1, '60'))
                .to.emit(this.staking, 'Rewarded')
                .withArgs(subjectType1, subject1, this.accounts.user3.address, '60');

            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('30');
            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('30');

            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '50')).to.be.not.reverted;
            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('30');
            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('30');

            await expect(this.staking.connect(this.accounts.user3).reward(subjectType1, subject1, '15')).to.be.not.reverted;

            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('40');
            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('35');

            await expect(this.staking.releaseReward(subjectType1, subject1, this.accounts.user1.address))
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.user1.address, '40');
            await expect(this.staking.releaseReward(subjectType1, subject1, this.accounts.user2.address))
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.user2.address, '35');
        });

        it('decrease shares', async function () {
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '100')).to.be.not.reverted;
            await expect(this.staking.connect(this.accounts.user2).deposit(subjectType1, subject1, '50')).to.be.not.reverted;

            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');
            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');

            await expect(this.staking.connect(this.accounts.user3).reward(subjectType1, subject1, '60')).to.be.not.reverted;

            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('40');
            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('20');

            await expect(this.staking.connect(this.accounts.user1).initiateWithdrawal(subjectType1, subject1, '50')).to.be.not.reverted;
            await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType1, subject1)).to.be.not.reverted;

            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('40');
            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('20');

            await expect(this.staking.connect(this.accounts.user3).reward(subjectType1, subject1, '40')).to.be.not.reverted;

            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('60');
            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('40');

            await expect(this.staking.releaseReward(subjectType1, subject1, this.accounts.user1.address))
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.user1.address, '60');
            await expect(this.staking.releaseReward(subjectType1, subject1, this.accounts.user2.address))
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.user2.address, '40');
        });

        it('transfer shares', async function () {
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '100')).to.be.not.reverted;
            await expect(this.staking.connect(this.accounts.user2).deposit(subjectType1, subject1, '50')).to.be.not.reverted;

            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');
            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');

            await expect(this.staking.connect(this.accounts.user3).reward(subjectType1, subject1, '60')).to.be.not.reverted;

            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('40');
            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('20');

            await expect(this.staking.connect(this.accounts.user1).safeTransferFrom(this.accounts.user1.address, this.accounts.user2.address, active1, '50', '0x')).to.be.not
                .reverted;

            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('40');
            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('20');

            await expect(this.staking.connect(this.accounts.user3).reward(subjectType1, subject1, '30')).to.be.not.reverted;

            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('50');
            expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('40');

            await expect(this.staking.releaseReward(subjectType1, subject1, this.accounts.user1.address))
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.user1.address, '50');
            await expect(this.staking.releaseReward(subjectType1, subject1, this.accounts.user2.address))
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.user2.address, '40');
        });
    });
});
