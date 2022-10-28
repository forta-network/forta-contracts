const { ethers } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');
const { subjectToActive, subjectToInactive } = require('../../scripts/utils/staking.js');

const subjects = [
    [ethers.BigNumber.from(ethers.utils.id('135a782d-c263-43bd-b70b-920873ed7e9d')), 1], // Agent id, agent type
    [ethers.BigNumber.from('1'), 2], // Node Runner id, Node Runner Type
];
const [[subject1, subjectType1, active1, inactive1], [subject2, subjectType2, active2, inactive2]] = subjects.map((items) => [
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

        await this.token.connect(this.accounts.user1).approve(this.staking.address, ethers.constants.MaxUint256);
        await this.token.connect(this.accounts.user2).approve(this.staking.address, ethers.constants.MaxUint256);
        await this.token.connect(this.accounts.user3).approve(this.staking.address, ethers.constants.MaxUint256);

        const args = [subject1, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5]];
        await this.agents.connect(this.accounts.other).createAgent(...args);
    });

    describe.skip('Rewards', function () {
        it('cannot reward to invalid subjectType', async function () {
            await expect(this.staking.connect(this.accounts.user1).reward(9, subject1, '10')).to.be.revertedWith('InvalidSubjectType(9)');
        });

        it('can reward to non zero subject', async function () {
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

    describe('Freezing', function () {
        beforeEach(async function () {
            this.accounts.getAccount('slasher');
            await this.access.connect(this.accounts.admin).grantRole(this.roles.SLASHER, this.accounts.slasher.address);
        });

        it('freeze → withdraw', async function () {
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '100'));

            await expect(this.staking.connect(this.accounts.slasher).freeze(subjectType1, subject1, true))
                .to.emit(this.staking, 'Froze')
                .withArgs(subjectType1, subject1, this.accounts.slasher.address, true);

            await expect(this.staking.connect(this.accounts.user1).initiateWithdrawal(subjectType1, subject1, '100'));
            await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType1, subject1)).to.be.revertedWith('FrozenSubject()');
        });

        it('freeze → unfreeze → withdraw', async function () {
            this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '100');

            await expect(this.staking.connect(this.accounts.slasher).freeze(subjectType1, subject1, true))
                .to.emit(this.staking, 'Froze')
                .withArgs(subjectType1, subject1, this.accounts.slasher.address, true);

            await expect(this.staking.connect(this.accounts.slasher).freeze(subjectType1, subject1, false))
                .to.emit(this.staking, 'Froze')
                .withArgs(subjectType1, subject1, this.accounts.slasher.address, false);

            this.staking.connect(this.accounts.user1).initiateWithdrawal(subjectType1, subject1, '100');
            await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType1, subject1))
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.user1.address, '100');
        });
    });

    describe('Slashing', function () {
        beforeEach(async function () {
            this.accounts.getAccount('slasher');
            await this.access.connect(this.accounts.admin).grantRole(this.roles.SLASHER, this.accounts.slasher.address);
        });

        it('slashing split shares', async function () {
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '100')).to.be.not.reverted;
            await expect(this.staking.connect(this.accounts.user2).deposit(subjectType1, subject1, '50')).to.be.not.reverted;

            expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('150');
            expect(await this.staking.totalActiveStake()).to.be.equal('150');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('100');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('50');
            expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('150');

            const balanceOfTreasury = await this.token.balanceOf(this.accounts.treasure.address);
            const balanceOfSlasher = await this.token.balanceOf(this.accounts.slasher.address);
            await expect(this.staking.connect(this.accounts.slasher).slash(subjectType1, subject1, '30', this.accounts.slasher.address, '50'))
                .to.emit(this.staking, 'Slashed')
                .withArgs(subjectType1, subject1, this.accounts.slasher.address, '30')
                .to.emit(this.staking, 'SlashedShareSent')
                .withArgs(subjectType1, subject1, this.accounts.slasher.address, '15')
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.slasher.address, '15')
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.treasure.address, '15');

            expect(await this.token.balanceOf(this.accounts.treasure.address)).to.eq(balanceOfTreasury.add('15'));
            expect(await this.token.balanceOf(this.accounts.slasher.address)).to.eq(balanceOfSlasher.add('15'));
        });

        it('slashing → withdraw', async function () {
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '100')).to.be.not.reverted;
            await expect(this.staking.connect(this.accounts.user2).deposit(subjectType1, subject1, '50')).to.be.not.reverted;

            expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('150');
            expect(await this.staking.totalActiveStake()).to.be.equal('150');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('100');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('50');
            expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('150');

            await expect(this.staking.connect(this.accounts.slasher).slash(subjectType1, subject1, '30', ethers.constants.AddressZero, '0'))
                .to.emit(this.staking, 'Slashed')
                .withArgs(subjectType1, subject1, this.accounts.slasher.address, '30')
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.treasure.address, '30');

            expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('120');
            expect(await this.staking.totalActiveStake()).to.be.equal('120');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('100');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('50');
            expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('150');

            await expect(this.staking.connect(this.accounts.user1).initiateWithdrawal(subjectType1, subject1, '100')).to.be.not.reverted;
            await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType1, subject1))
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.user1.address, '80');

            expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('40');
            expect(await this.staking.totalActiveStake()).to.be.equal('40');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('50');
            expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('50');

            await expect(this.staking.connect(this.accounts.user2).initiateWithdrawal(subjectType1, subject1, '50')).to.be.not.reverted;
            await expect(this.staking.connect(this.accounts.user2).withdraw(subjectType1, subject1))
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.user2.address, '40');

            expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('0');
            expect(await this.staking.totalActiveStake()).to.be.equal('0');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('0');
            expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('0');
        });

        it('slashing → deposit', async function () {
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '100')).to.be.not.reverted;
            await expect(this.staking.connect(this.accounts.user2).deposit(subjectType1, subject1, '50')).to.be.not.reverted;

            expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('150');
            expect(await this.staking.totalActiveStake()).to.be.equal('150');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('100');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('50');
            expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('150');

            await expect(this.staking.connect(this.accounts.slasher).slash(subjectType1, subject1, '30', ethers.constants.AddressZero, '0'))
                .to.emit(this.staking, 'Slashed')
                .withArgs(subjectType1, subject1, this.accounts.slasher.address, '30')
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.treasure.address, '30');

            expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('120');
            expect(await this.staking.totalActiveStake()).to.be.equal('120');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('100');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('50');
            expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('150');

            await expect(this.staking.connect(this.accounts.user3).deposit(subjectType1, subject1, '60')).to.be.not.reverted;

            expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('180');
            expect(await this.staking.totalActiveStake()).to.be.equal('180');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('100');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('50');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user3.address)).to.be.equal('75');
            expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('225');

            await expect(this.staking.connect(this.accounts.user1).initiateWithdrawal(subjectType1, subject1, '100')).to.be.not.reverted;
            await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType1, subject1))
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.user1.address, '80');

            expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('100');
            expect(await this.staking.totalActiveStake()).to.be.equal('100');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('50');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user3.address)).to.be.equal('75');
            expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('125');

            await expect(this.staking.connect(this.accounts.user2).initiateWithdrawal(subjectType1, subject1, '50')).to.be.not.reverted;
            await expect(this.staking.connect(this.accounts.user2).withdraw(subjectType1, subject1))
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.user2.address, '40');

            expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('60');
            expect(await this.staking.totalActiveStake()).to.be.equal('60');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('0');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user3.address)).to.be.equal('75');
            expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('75');

            await expect(this.staking.connect(this.accounts.user3).initiateWithdrawal(subjectType1, subject1, '75')).to.be.not.reverted;
            await expect(this.staking.connect(this.accounts.user3).withdraw(subjectType1, subject1))
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.user3.address, '60');

            expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('0');
            expect(await this.staking.totalActiveStake()).to.be.equal('0');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');
            expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('0');
            expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('0');
        });

        it('initiate → slashing → withdraw', async function () {
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '100')).to.be.not.reverted;
            await expect(this.staking.connect(this.accounts.user2).deposit(subjectType1, subject1, '100')).to.be.not.reverted;
            await expect(this.staking.connect(this.accounts.user1).initiateWithdrawal(subjectType1, subject1, '100')).to.be.not.reverted;
            await expect(this.staking.connect(this.accounts.user2).initiateWithdrawal(subjectType1, subject1, '50')).to.be.not.reverted;

            expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('50');
            expect(await this.staking.inactiveStakeFor(subjectType1, subject1)).to.be.equal('150');
            expect(await this.staking.balanceOf(this.accounts.user1.address, active1)).to.be.equal('0');
            expect(await this.staking.balanceOf(this.accounts.user2.address, active1)).to.be.equal('50');
            expect(await this.staking.balanceOf(this.accounts.user1.address, inactive1)).to.be.equal('100');
            expect(await this.staking.balanceOf(this.accounts.user2.address, inactive1)).to.be.equal('50');

            await expect(this.staking.connect(this.accounts.slasher).slash(subjectType1, subject1, '120', ethers.constants.AddressZero, '0'))
                .to.emit(this.staking, 'Slashed')
                .withArgs(subjectType1, subject1, this.accounts.slasher.address, '120')
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.treasure.address, '120');

            expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('20');
            expect(await this.staking.inactiveStakeFor(subjectType1, subject1)).to.be.equal('60');
            expect(await this.staking.balanceOf(this.accounts.user1.address, active1)).to.be.equal('0');
            expect(await this.staking.balanceOf(this.accounts.user2.address, active1)).to.be.equal('50');
            expect(await this.staking.balanceOf(this.accounts.user1.address, inactive1)).to.be.equal('100');
            expect(await this.staking.balanceOf(this.accounts.user2.address, inactive1)).to.be.equal('50');

            await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType1, subject1))
                .to.emit(this.staking, 'TransferSingle')
                .withArgs(this.accounts.user1.address, this.accounts.user1.address, ethers.constants.AddressZero, inactive1, '100')
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.user1.address, '40');

            await expect(this.staking.connect(this.accounts.user2).withdraw(subjectType1, subject1))
                .to.emit(this.staking, 'TransferSingle')
                .withArgs(this.accounts.user2.address, this.accounts.user2.address, ethers.constants.AddressZero, inactive1, '50')
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.user2.address, '20');
        });
    });

    describe.skip('token sweeping', async function () {
        beforeEach(async function () {
            this.accounts.getAccount('slasher');
            this.accounts.getAccount('sweeper');
            await this.access.connect(this.accounts.admin).grantRole(this.roles.SWEEPER, this.accounts.sweeper.address);
            await this.access.connect(this.accounts.admin).grantRole(this.roles.SLASHER, this.accounts.slasher.address);

            this.staking.connect(this.accounts.user1).deposit(subjectType2, subject2, '100');
            this.staking.connect(this.accounts.user1).initiateWithdrawal(subjectType2, subject2, '50');
            this.staking.connect(this.accounts.user2).deposit(subjectType2, subject2, '100');
            this.staking.connect(this.accounts.user3).reward(subjectType2, subject2, '100');
            this.staking.connect(this.accounts.slasher).slash(subjectType2, subject2, '120', ethers.constants.AddressZero, '0');
        });

        it('sweep unrelated token', async function () {
            await expect(this.otherToken.connect(this.accounts.minter).mint(this.staking.address, '42')).to.be.not.reverted;

            expect(await this.token.balanceOf(this.staking.address)).to.be.equal('180');
            expect(await this.otherToken.balanceOf(this.staking.address)).to.be.equal('42');

            await expect(this.staking.connect(this.accounts.user1).sweep(this.otherToken.address, this.accounts.user1.address)).to.be.revertedWith(
                `MissingRole("${this.roles.SWEEPER}", "${this.accounts.user1.address}")`
            );

            await expect(this.staking.connect(this.accounts.sweeper).sweep(this.otherToken.address, this.accounts.sweeper.address))
                .to.emit(this.otherToken, 'Transfer')
                .withArgs(this.staking.address, this.accounts.sweeper.address, '42');

            expect(await this.token.balanceOf(this.staking.address)).to.be.equal('180');
            expect(await this.otherToken.balanceOf(this.staking.address)).to.be.equal('0');
        });

        it('sweep staked token', async function () {
            expect(await this.token.balanceOf(this.staking.address)).to.be.equal('180');

            await expect(this.token.connect(this.accounts.user3).transfer(this.staking.address, '17')).to.be.not.reverted;

            expect(await this.token.balanceOf(this.staking.address)).to.be.equal('197');

            await expect(this.staking.connect(this.accounts.user1).sweep(this.token.address, this.accounts.user1.address)).to.be.revertedWith(
                `MissingRole("${this.roles.SWEEPER}", "${this.accounts.user1.address}")`
            );

            await expect(this.staking.connect(this.accounts.sweeper).sweep(this.token.address, this.accounts.sweeper.address))
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.sweeper.address, '17');

            expect(await this.token.balanceOf(this.staking.address)).to.be.equal('180');
        });
    });

    describe.skip('attack scenario', function () {
        it('dusting', async function () {
            await this.agents.connect(this.accounts.manager).setStakeThreshold({ max: ethers.utils.parseEther('5000'), min: '1', activated: true });

            const legitimate = this.accounts.user1;
            const attacker = this.accounts.user2;

            {
                const totalShares = await this.staking.totalShares(subjectType2, subject2).then((x) => x.toNumber());
                const shares = await this.staking.sharesOf(subjectType2, subject2, legitimate.address).then((x) => x.toNumber());
                const availableReward = await this.staking.availableReward(subjectType2, subject2, legitimate.address).then((x) => x.toNumber());
                console.table({ totalShares, shares, availableReward });
            }

            await this.staking.connect(legitimate).deposit(subjectType2, subject2, '20000000000000');

            {
                const totalShares = await this.staking.totalShares(subjectType2, subject2).then((x) => x.toNumber());
                const shares = await this.staking.sharesOf(subjectType2, subject2, legitimate.address).then((x) => x.toNumber());
                const availableReward = await this.staking.availableReward(subjectType2, subject2, legitimate.address).then((x) => x.toNumber());
                console.table({ totalShares, shares, availableReward });
            }

            await this.staking.connect(legitimate).reward(subjectType2, subject2, '10000000000000');

            {
                const totalShares = await this.staking.totalShares(subjectType2, subject2).then((x) => x.toNumber());
                const shares = await this.staking.sharesOf(subjectType2, subject2, legitimate.address).then((x) => x.toNumber());
                const availableReward = await this.staking.availableReward(subjectType2, subject2, legitimate.address).then((x) => x.toNumber());
                console.table({ totalShares, shares, availableReward });
            }

            await this.staking.connect(attacker).deposit(subjectType2, subject2, '3');

            {
                const totalShares = await this.staking.totalShares(subjectType2, subject2).then((x) => x.toNumber());
                const shares = await this.staking.sharesOf(subjectType2, subject2, legitimate.address).then((x) => x.toNumber());
                const availableReward = await this.staking.availableReward(subjectType2, subject2, legitimate.address).then((x) => x.toNumber());
                console.table({ totalShares, shares, availableReward });
            }

            await this.staking.connect(attacker).initiateWithdrawal(subjectType2, subject2, '2');
            await this.staking.connect(attacker).initiateWithdrawal(subjectType2, subject2, '1');

            {
                const totalShares = await this.staking.totalShares(subjectType2, subject2).then((x) => x.toNumber());
                const shares = await this.staking.sharesOf(subjectType2, subject2, legitimate.address).then((x) => x.toNumber());
                const availableReward = await this.staking.availableReward(subjectType2, subject2, legitimate.address).then((x) => x.toNumber());
                console.table({ totalShares, shares, availableReward });
            }

            await this.staking.releaseReward(subjectType2, subject2, legitimate.address);
        });
    });
});
