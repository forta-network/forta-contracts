const { ethers, network } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');
const { subjectToActive, subjectToInactive } = require('../../scripts/utils/staking.js');

const LOCKED_OFFSET = ethers.BigNumber.from(2).pow(160);
const SUBJECT_1_ADDRESS = '0x727E5FCcb9e2367555373e90E637500BCa5Da40c'
const subjects = [
  [ ethers.BigNumber.from(SUBJECT_1_ADDRESS), 0 ],// Scanner id, scanner type
  [ ethers.BigNumber.from(ethers.utils.id('135a782d-c263-43bd-b70b-920873ed7e9d')), 1 ]// Agent id, agent type
]
const [
  [ subject1, subjectType1, active1, inactive1 ],
  [ subject2, subjectType2, active2, inactive2 ],
] = subjects.map(items => [items[0], items[1], subjectToActive(items[1], items[0]), subjectToInactive(items[1], items[0])])
const txTimestamp = (tx) => tx.wait().then(({ blockNumber }) => ethers.provider.getBlock(blockNumber)).then(({ timestamp }) => timestamp);
const MAX_STAKE = '10000'
describe('Forta Staking', function () {
  prepare({ stake: { min: '1', max: MAX_STAKE}});

  beforeEach(async function () {
    await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.user1.address);
    await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.user2.address);
    await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.user3.address);
    await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.minter.address);

    await this.token.connect(this.accounts.minter).mint(this.accounts.user1.address, ethers.utils.parseEther('1000'));
    await this.token.connect(this.accounts.minter).mint(this.accounts.user2.address, ethers.utils.parseEther('1000'));
    await this.token.connect(this.accounts.minter).mint(this.accounts.user3.address, ethers.utils.parseEther('1000'));

    await this.token.connect(this.accounts.user1).approve(this.staking.address, ethers.constants.MaxUint256);
    await this.token.connect(this.accounts.user2).approve(this.staking.address, ethers.constants.MaxUint256);
    await this.token.connect(this.accounts.user3).approve(this.staking.address, ethers.constants.MaxUint256);

    await this.scanners.connect(this.accounts.manager).adminRegister(SUBJECT_1_ADDRESS, this.accounts.user1.address, 1, 'metadata')
  });

  describe('Deposit / Withdraw', function () {
    describe('no delay', function () {
      it('happy path 1 subject', async function () {
        expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('0');
        expect(await this.staking.totalActiveStake()).to.be.equal('0');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('0');


        await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '100'))
        .to.emit(this.token, 'Transfer').withArgs(this.accounts.user1.address, this.staking.address, '100')
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user1.address, ethers.constants.AddressZero, this.accounts.user1.address, active1, '100')
        .to.emit(this.staking, 'StakeDeposited').withArgs(subjectType1, subject1, this.accounts.user1.address, '100');
        
        expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('100');
        expect(await this.staking.totalActiveStake()).to.be.equal('100');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('100');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('100');

        await expect(this.staking.connect(this.accounts.user2).deposit(subjectType1, subject1, '100'))
        .to.emit(this.token, 'Transfer').withArgs(this.accounts.user2.address, this.staking.address, '100')
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user2.address, ethers.constants.AddressZero, this.accounts.user2.address, active1, '100')
        .to.emit(this.staking, 'StakeDeposited').withArgs(subjectType1, subject1, this.accounts.user2.address, '100');

        expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('200');
        expect(await this.staking.totalActiveStake()).to.be.equal('200');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('100');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('100');
        expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('200');

        await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType1, subject1)).to.be.reverted;
        await expect(this.staking.connect(this.accounts.user2).withdraw(subjectType1, subject1)).to.be.reverted;

        const tx1 = await this.staking.connect(this.accounts.user1).initiateWithdrawal(subjectType1, subject1, '50');
        await expect(tx1)
        .to.emit(this.staking, 'WithdrawalInitiated').withArgs(subjectType1, subject1, this.accounts.user1.address, await txTimestamp(tx1))
        .to.emit(this.staking, 'TransferSingle')/*.withArgs(this.accounts.user1.address, this.accounts.user1.address, ethers.constants.AddressZero, subject1, '50')*/
        .to.emit(this.staking, 'TransferSingle')/*.withArgs(this.accounts.user1.address, ethers.constants.AddressZero, this.accounts.user1.address, inactive1, '50')*/

        await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType1, subject1))
        .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '50')
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user1.address, this.accounts.user1.address, ethers.constants.AddressZero, inactive1, '50')
        .to.emit(this.staking, 'WithdrawalExecuted').withArgs(subjectType1, subject1, this.accounts.user1.address);

        expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('150');
        expect(await this.staking.totalActiveStake()).to.be.equal('150');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('50');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('100');
        expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('150');

        await expect(this.staking.connect(this.accounts.user1).withdraw(subject1)).to.be.reverted;
        await expect(this.staking.connect(this.accounts.user2).withdraw(subject1)).to.be.reverted;

        const tx2 = await this.staking.connect(this.accounts.user2).initiateWithdrawal(subjectType1, subject1, '100');
        await expect(tx2)
        .to.emit(this.staking, 'WithdrawalInitiated').withArgs(subjectType1, subject1, this.accounts.user2.address, await txTimestamp(tx2))
        .to.emit(this.staking, 'TransferSingle')/*.withArgs(this.accounts.user2.address, this.accounts.user2.address, ethers.constants.AddressZero, subject1, '100')*/
        .to.emit(this.staking, 'TransferSingle')/*.withArgs(this.accounts.user2.address, ethers.constants.AddressZero, this.accounts.user2.address, inactive1, '100')*/

        await expect(this.staking.connect(this.accounts.user2).withdraw(subjectType1, subject1))
        .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '100')
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user2.address, this.accounts.user2.address, ethers.constants.AddressZero, inactive1, '100')
        .to.emit(this.staking, 'WithdrawalExecuted').withArgs(subjectType1, subject1, this.accounts.user2.address);

        expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('50');
        expect(await this.staking.totalActiveStake()).to.be.equal('50');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('50');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('50');

        await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType1, subject1)).to.be.reverted;
        await expect(this.staking.connect(this.accounts.user2).withdraw(subjectType1, subject1)).to.be.reverted;
      });

      it('happy path 2 subjects', async function () {
        expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('0');
        expect(await this.staking.activeStakeFor(subjectType2, subject2)).to.be.equal('0');
        expect(await this.staking.totalActiveStake()).to.be.equal('0');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.sharesOf(subjectType2, subject2, this.accounts.user3.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('0');
        expect(await this.staking.totalShares(subjectType2, subject2)).to.be.equal('0');

        await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '100'))
        .to.emit(this.token, 'Transfer').withArgs(this.accounts.user1.address, this.staking.address, '100')
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user1.address, ethers.constants.AddressZero, this.accounts.user1.address, active1, '100')
        .to.emit(this.staking, 'StakeDeposited').withArgs(subjectType1, subject1, this.accounts.user1.address, '100');
        
        expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('100');
        expect(await this.staking.totalActiveStake()).to.be.equal('100');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('100');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('100');

        await expect(this.staking.connect(this.accounts.user2).deposit(subjectType1, subject1, '100'))
        .to.emit(this.token, 'Transfer').withArgs(this.accounts.user2.address, this.staking.address, '100')
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user2.address, ethers.constants.AddressZero, this.accounts.user2.address, active1, '100')
        .to.emit(this.staking, 'StakeDeposited').withArgs(subjectType1, subject1, this.accounts.user2.address, '100');

        expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('200');
        expect(await this.staking.totalActiveStake()).to.be.equal('200');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('100');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('100');
        expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('200');

        await expect(this.staking.connect(this.accounts.user3).deposit(subjectType2, subject2, '100'))
        .to.emit(this.token, 'Transfer').withArgs(this.accounts.user3.address, this.staking.address, '100')
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user3.address, ethers.constants.AddressZero, this.accounts.user3.address, active2, '100')
        .to.emit(this.staking, 'StakeDeposited').withArgs(subjectType2, subject2, this.accounts.user3.address, '100');

        expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('200');
        expect(await this.staking.totalActiveStake()).to.be.equal('300');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('100');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('100');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user3.address)).to.be.equal('0');
        expect(await this.staking.sharesOf(subjectType2, subject2, this.accounts.user3.address)).to.be.equal('100');
        expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('200');
        expect(await this.staking.totalShares(subjectType2, subject2)).to.be.equal('100');

        await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType1, subject1)).to.be.reverted;
        await expect(this.staking.connect(this.accounts.user2).withdraw(subjectType1, subject1)).to.be.reverted;
        await expect(this.staking.connect(this.accounts.user3).withdraw(subjectType2, subject2)).to.be.reverted;

        const tx1 = await this.staking.connect(this.accounts.user1).initiateWithdrawal(subjectType1, subject1, '50');
        await expect(tx1)
        .to.emit(this.staking, 'WithdrawalInitiated').withArgs(subjectType1, subject1, this.accounts.user1.address, await txTimestamp(tx1))
        .to.emit(this.staking, 'TransferSingle')/*.withArgs(this.accounts.user1.address, this.accounts.user1.address, ethers.constants.AddressZero, subject1, '50')*/
        .to.emit(this.staking, 'TransferSingle')/*.withArgs(this.accounts.user1.address, ethers.constants.AddressZero, this.accounts.user1.address, inactive1, '50')*/

        await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType1, subject1))
        .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '50')
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user1.address, this.accounts.user1.address, ethers.constants.AddressZero, inactive1, '50')
        .to.emit(this.staking, 'WithdrawalExecuted').withArgs(subjectType1, subject1, this.accounts.user1.address);

        expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('150');
        expect(await this.staking.totalActiveStake()).to.be.equal('250');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('50');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('100');
        expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('150');

        await expect(this.staking.connect(this.accounts.user1).withdraw(subject1)).to.be.reverted;
        await expect(this.staking.connect(this.accounts.user2).withdraw(subject1)).to.be.reverted;

        const tx2 = await this.staking.connect(this.accounts.user2).initiateWithdrawal(subjectType1, subject1, '100');
        await expect(tx2)
        .to.emit(this.staking, 'WithdrawalInitiated').withArgs(subjectType1, subject1, this.accounts.user2.address, await txTimestamp(tx2))
        .to.emit(this.staking, 'TransferSingle')/*.withArgs(this.accounts.user2.address, this.accounts.user2.address, ethers.constants.AddressZero, subject1, '100')*/
        .to.emit(this.staking, 'TransferSingle')/*.withArgs(this.accounts.user2.address, ethers.constants.AddressZero, this.accounts.user2.address, inactive1, '100')*/

        await expect(this.staking.connect(this.accounts.user2).withdraw(subjectType1, subject1))
        .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '100')
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user2.address, this.accounts.user2.address, ethers.constants.AddressZero, inactive1, '100')
        .to.emit(this.staking, 'WithdrawalExecuted').withArgs(subjectType1, subject1, this.accounts.user2.address);

        const tx3 = await this.staking.connect(this.accounts.user3).initiateWithdrawal(subjectType2, subject2, '100');
        await expect(tx3)
        .to.emit(this.staking, 'WithdrawalInitiated').withArgs(subjectType2, subject2, this.accounts.user3.address, await txTimestamp(tx2))
        .to.emit(this.staking, 'TransferSingle')/*.withArgs(this.accounts.user2.address, this.accounts.user2.address, ethers.constants.AddressZero, subject1, '100')*/
        .to.emit(this.staking, 'TransferSingle')/*.withArgs(this.accounts.user2.address, ethers.constants.AddressZero, this.accounts.user2.address, inactive1, '100')*/

        await expect(this.staking.connect(this.accounts.user3).withdraw(subjectType2, subject2))
        .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user3.address, '100')
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user3.address, this.accounts.user3.address, ethers.constants.AddressZero, inactive2, '100')
        .to.emit(this.staking, 'WithdrawalExecuted').withArgs(subjectType2, subject2, this.accounts.user3.address);

        expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('50');
        expect(await this.staking.totalActiveStake()).to.be.equal('50');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('50');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.sharesOf(subjectType2, subject2, this.accounts.user3.address)).to.be.equal('0');

        expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('50');
        expect(await this.staking.totalShares(subjectType2, subject2)).to.be.equal('0');

        await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType1, subject1)).to.be.reverted;
        await expect(this.staking.connect(this.accounts.user2).withdraw(subjectType1, subject1)).to.be.reverted;
        await expect(this.staking.connect(this.accounts.user3).withdraw(subjectType2, subject2)).to.be.reverted;

      });

      it('stake over max does not transfer tokens', async function () {
        expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('0');
        expect(await this.staking.totalActiveStake()).to.be.equal('0');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('0');


        await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '100'))
        .to.emit(this.token, 'Transfer').withArgs(this.accounts.user1.address, this.staking.address, '100')
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user1.address, ethers.constants.AddressZero, this.accounts.user1.address, active1, '100')
        .to.emit(this.staking, 'StakeDeposited').withArgs(subjectType1, subject1, this.accounts.user1.address, '100');
        const difference = ethers.BigNumber.from(MAX_STAKE).sub('100')
        await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, MAX_STAKE))
        .to.emit(this.token, 'Transfer').withArgs(this.accounts.user1.address, this.staking.address, difference)
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user1.address, ethers.constants.AddressZero, this.accounts.user1.address, active1, difference)
        .to.emit(this.staking, 'StakeDeposited').withArgs(subjectType1, subject1, this.accounts.user1.address, difference)
        .to.emit(this.staking, 'MaxStakeReached').withArgs(subjectType1, subject1);

        await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, MAX_STAKE))
        .to.emit(this.token, 'Transfer').withArgs(this.accounts.user1.address, this.staking.address, '0')
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user1.address, ethers.constants.AddressZero, this.accounts.user1.address, active1, '0')
        .to.emit(this.staking, 'StakeDeposited').withArgs(subjectType1, subject1, this.accounts.user1.address, '0')
        .to.emit(this.staking, 'MaxStakeReached').withArgs(subjectType1, subject1);

      });

      it('invalid subjectType', async function () {
        await expect(this.staking.connect(this.accounts.user1).deposit(9, subject1, '100'))
        .to.be.revertedWith('STV: invalid subjectType');
      });

      it('cannot initiate withdraw with no active shares', async function () {
        await expect(this.staking.connect(this.accounts.user1).initiateWithdrawal(1, subject1, '100'))
        .to.be.revertedWith('FS: no active shares');
      });

      it('cannot withdraw with no inactive shares', async function () {
        await expect(this.staking.connect(this.accounts.user1).withdraw(1, subject1))
        .to.be.revertedWith('FS: no inactive shares');
      });
    });

    describe('with delay', function () {
      beforeEach(async function () {
        await expect(this.staking.setDelay(3600))
        .to.emit(this.staking, 'DelaySet').withArgs(3600)
      });

      it('happy path', async function () {
        expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('0');
        expect(await this.staking.totalActiveStake()).to.be.equal('0');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('0');

        await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '100'))
        .to.emit(this.token, 'Transfer').withArgs(this.accounts.user1.address, this.staking.address, '100')
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user1.address, ethers.constants.AddressZero, this.accounts.user1.address, active1, '100')
        .to.emit(this.staking, 'StakeDeposited').withArgs(subjectType1, subject1, this.accounts.user1.address, '100');

        expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('100');
        expect(await this.staking.totalActiveStake()).to.be.equal('100');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('100');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('100');

        await expect(this.staking.connect(this.accounts.user2).deposit(subjectType1, subject1, '100'))
        .to.emit(this.token, 'Transfer').withArgs(this.accounts.user2.address, this.staking.address, '100')
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user2.address, ethers.constants.AddressZero, this.accounts.user2.address, active1, '100')
        .to.emit(this.staking, 'StakeDeposited').withArgs(subjectType1, subject1, this.accounts.user2.address, '100');

        expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('200');
        expect(await this.staking.totalActiveStake()).to.be.equal('200');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('100');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('100');
        expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('200');

        await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType1, subject1)).to.be.reverted;
        await expect(this.staking.connect(this.accounts.user2).withdraw(subjectType1, subject1)).to.be.reverted;

        const tx1 = await this.staking.connect(this.accounts.user1).initiateWithdrawal(subjectType1, subject1, '50');
        await expect(tx1)
        .to.emit(this.staking, 'WithdrawalInitiated').withArgs(subjectType1, subject1, this.accounts.user1.address, await txTimestamp(tx1) + 3600)
        .to.emit(this.staking, 'TransferSingle')/*.withArgs(this.accounts.user2.address, this.accounts.user2.address, ethers.constants.AddressZero, subject1, '100')*/
        .to.emit(this.staking, 'TransferSingle')/*.withArgs(this.accounts.user2.address, ethers.constants.AddressZero, this.accounts.user2.address, inactive1, '100')*/

        await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType1, subject1)).to.be.reverted;

        await network.provider.send('evm_increaseTime', [ 3600 ]);

        await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType1, subject1))
        .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '50')
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user1.address, this.accounts.user1.address, ethers.constants.AddressZero, inactive1, '50')
        .to.emit(this.staking, 'WithdrawalExecuted').withArgs(subjectType1, subject1, this.accounts.user1.address);

        expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('150');
        expect(await this.staking.totalActiveStake()).to.be.equal('150');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('50');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('100');
        expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('150');

        await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType1, subject1)).to.be.reverted;
        await expect(this.staking.connect(this.accounts.user2).withdraw(subjectType1, subject1)).to.be.reverted;

        const tx2 = await this.staking.connect(this.accounts.user2).initiateWithdrawal(subjectType1, subject1, '100');
        await expect(tx2)
        .to.emit(this.staking, 'WithdrawalInitiated').withArgs(subjectType1, subject1, this.accounts.user2.address, await txTimestamp(tx2) + 3600)
        .to.emit(this.staking, 'TransferSingle')/*.withArgs(this.accounts.user2.address, this.accounts.user2.address, ethers.constants.AddressZero, subject1, '100')*/
        .to.emit(this.staking, 'TransferSingle')/*.withArgs(this.accounts.user2.address, ethers.constants.AddressZero, this.accounts.user2.address, inactive1, '100')*/

        await expect(this.staking.connect(this.accounts.user2).withdraw(subjectType1, subject1)).to.be.reverted;

        await network.provider.send('evm_increaseTime', [ 3600 ]);

        await expect(this.staking.connect(this.accounts.user2).withdraw(subjectType1, subject1))
        .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '100')
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user2.address, this.accounts.user2.address, ethers.constants.AddressZero, inactive1, '100')
        .to.emit(this.staking, 'WithdrawalExecuted').withArgs(subjectType1, subject1, this.accounts.user2.address);

        expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('50');
        expect(await this.staking.totalActiveStake()).to.be.equal('50');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('50');
        expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('50');

        await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType1, subject1)).to.be.reverted;
        await expect(this.staking.connect(this.accounts.user2).withdraw(subjectType1, subject1)).to.be.reverted;
      });
    });
  });

  describe('Rewards', function () {

    it ('cannot reward to invalid subjectType', async function () {

      await expect(this.staking.connect(this.accounts.user1).reward(9, subject1, '10'))
      .to.be.revertedWith('STV: invalid subjectType');
    });

    it ('can reward to non zero subject', async function () {
      const subject = '0x0000000000000000000000000000000000000001';

      await expect(this.staking.connect(this.accounts.user1).reward(subjectType1, subject1, '10'))
      .to.emit(this.staking, 'Rewarded').withArgs(subjectType1, subject1, this.accounts.user1.address, '10');
    });

    it('fix shares', async function () {
      await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user2).deposit(subjectType1, subject1, '50')).to.be.not.reverted;

      expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('100');
      expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('50');
      expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('150');

      expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');
      await expect(this.staking.releaseReward(subjectType1, subject1, this.accounts.user1.address))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '0')
      .to.emit(this.staking, 'Released').withArgs(subjectType1, subject1, this.accounts.user1.address, '0');

      expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');
      await expect(this.staking.releaseReward(subjectType1, subject1, this.accounts.user2.address))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '0')
      .to.emit(this.staking, 'Released').withArgs(subjectType1, subject1, this.accounts.user2.address, '0');

      await expect(this.staking.connect(this.accounts.user3).reward(subjectType1, subject1, '60'))
      .to.emit(this.staking, 'Rewarded').withArgs(subjectType1, subject1, this.accounts.user3.address, '60');

      expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('40');
      await expect(this.staking.releaseReward(subjectType1, subject1, this.accounts.user1.address))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '40')
      .to.emit(this.staking, 'Released').withArgs(subjectType1, subject1, this.accounts.user1.address, '40');

      await expect(this.staking.connect(this.accounts.user3).reward(subjectType1, subject1, '15'))
      .to.emit(this.staking, 'Rewarded').withArgs(subjectType1, subject1, this.accounts.user3.address, '15');

      expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('10');
      await expect(this.staking.releaseReward(subjectType1, subject1, this.accounts.user1.address))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '10')
      .to.emit(this.staking, 'Released').withArgs(subjectType1, subject1, this.accounts.user1.address, '10');

      expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('25');
      await expect(this.staking.releaseReward(subjectType1, subject1, this.accounts.user2.address))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '25')
      .to.emit(this.staking, 'Released').withArgs(subjectType1, subject1, this.accounts.user2.address, '25');
    });

    it('increassing shares', async function () {
      await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '50')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user2).deposit(subjectType1, subject1, '50')).to.be.not.reverted;

      expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');
      expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('0');
      
      await expect(this.staking.connect(this.accounts.user3).reward(subjectType1, subject1, '60'))
      .to.emit(this.staking, 'Rewarded').withArgs(subjectType1, subject1, this.accounts.user3.address, '60');

      expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('30');
      expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('30');

      await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '50')).to.be.not.reverted;
      expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('30');
      expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('30');

      await expect(this.staking.connect(this.accounts.user3).reward(subjectType1, subject1, '15')).to.be.not.reverted;

      expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('40');
      expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('35');

      await expect(this.staking.releaseReward(subjectType1, subject1, this.accounts.user1.address))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '40');
      await expect(this.staking.releaseReward(subjectType1, subject1, this.accounts.user2.address))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '35');
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
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '60');
      await expect(this.staking.releaseReward(subjectType1, subject1, this.accounts.user2.address))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '40');
    });

    it('transfer shares', async function () {
      await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user2).deposit(subjectType1, subject1, '50')).to.be.not.reverted;

      expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');
      expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');

      await expect(this.staking.connect(this.accounts.user3).reward(subjectType1, subject1, '60')).to.be.not.reverted;

      expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('40');
      expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('20');

      await expect(this.staking.connect(this.accounts.user1).safeTransferFrom(this.accounts.user1.address, this.accounts.user2.address, active1, '50', "0x")).to.be.not.reverted;

      expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('40');
      expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('20');

      await expect(this.staking.connect(this.accounts.user3).reward(subjectType1, subject1, '30')).to.be.not.reverted;

      expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('50');
      expect(await this.staking.availableReward(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('40');

      await expect(this.staking.releaseReward(subjectType1, subject1, this.accounts.user1.address))
        .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '50');
      await expect(this.staking.releaseReward(subjectType1, subject1, this.accounts.user2.address))
        .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '40');
    });
  });

  describe('Freezing', function () {
    beforeEach(async function () {
      this.accounts.getAccount('slasher');
      await expect(this.access.connect(this.accounts.admin).grantRole(this.roles.SLASHER, this.accounts.slasher.address)).to.be.not.reverted;
      await expect(this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.slasher.address)).to.be.not.reverted;
    });

    it('freeze → withdraw', async function () {
      await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '100')).to.be.not.reverted;

      await expect(this.staking.connect(this.accounts.slasher).freeze(subjectType1, subject1, true))
      .to.emit(this.staking, 'Froze').withArgs(subjectType1, subject1, this.accounts.slasher.address, true);

      await expect(this.staking.connect(this.accounts.user1).initiateWithdrawal(subjectType1, subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType1, subject1))
      .to.be.revertedWith('FS: stake frozen');
    });

    it('freeze → unfreeze → withdraw', async function () {
      await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '100')).to.be.not.reverted;

      await expect(this.staking.connect(this.accounts.slasher).freeze(subjectType1, subject1, true))
      .to.emit(this.staking, 'Froze').withArgs(subjectType1, subject1, this.accounts.slasher.address, true);

      await expect(this.staking.connect(this.accounts.slasher).freeze(subjectType1, subject1, false))
      .to.emit(this.staking, 'Froze').withArgs(subjectType1, subject1, this.accounts.slasher.address, false);

      await expect(this.staking.connect(this.accounts.user1).initiateWithdrawal(subjectType1, subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType1, subject1))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '100');
    });
  });

  describe('Slashing', function () {
    beforeEach(async function () {
      this.accounts.getAccount('slasher');
      await expect(this.access.connect(this.accounts.admin).grantRole(this.roles.SLASHER, this.accounts.slasher.address)).to.be.not.reverted;
      await expect(this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.slasher.address)).to.be.not.reverted;
    });

    it('slashing → withdraw', async function () {
      await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user2).deposit(subjectType1, subject1, '50')).to.be.not.reverted;

      expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('150');
      expect(await this.staking.totalActiveStake()).to.be.equal('150');
      expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('100');
      expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('50');
      expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('150');

      await expect(this.staking.connect(this.accounts.slasher).slash(subjectType1, subject1, '30'))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.treasure.address, '30');

      expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('120');
      expect(await this.staking.totalActiveStake()).to.be.equal('120');
      expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('100');
      expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('50');
      expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('150');

      await expect(this.staking.connect(this.accounts.user1).initiateWithdrawal(subjectType1, subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType1, subject1))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '80');

      expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('40');
      expect(await this.staking.totalActiveStake()).to.be.equal('40');
      expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');
      expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('50');
      expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('50');

      await expect(this.staking.connect(this.accounts.user2).initiateWithdrawal(subjectType1, subject1, '50')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user2).withdraw(subjectType1, subject1))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '40');

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

      await expect(this.staking.connect(this.accounts.slasher).slash(subjectType1, subject1, '30'))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.treasure.address, '30');

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
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '80');

      expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('100');
      expect(await this.staking.totalActiveStake()).to.be.equal('100');
      expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');
      expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('50');
      expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user3.address)).to.be.equal('75');
      expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('125');

      await expect(this.staking.connect(this.accounts.user2).initiateWithdrawal(subjectType1, subject1, '50')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user2).withdraw(subjectType1, subject1))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '40');

      expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('60');
      expect(await this.staking.totalActiveStake()).to.be.equal('60');
      expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user1.address)).to.be.equal('0');
      expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user2.address)).to.be.equal('0');
      expect(await this.staking.sharesOf(subjectType1, subject1, this.accounts.user3.address)).to.be.equal('75');
      expect(await this.staking.totalShares(subjectType1, subject1)).to.be.equal('75');

      await expect(this.staking.connect(this.accounts.user3).initiateWithdrawal(subjectType1, subject1, '75')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user3).withdraw(subjectType1, subject1))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user3.address, '60');

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

      await expect(this.staking.connect(this.accounts.slasher).slash(subjectType1, subject1, '120'))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.treasure.address, '120');

      expect(await this.staking.activeStakeFor(subjectType1, subject1)).to.be.equal('20');
      expect(await this.staking.inactiveStakeFor(subjectType1, subject1)).to.be.equal('60');
      expect(await this.staking.balanceOf(this.accounts.user1.address, active1)).to.be.equal('0');
      expect(await this.staking.balanceOf(this.accounts.user2.address, active1)).to.be.equal('50');
      expect(await this.staking.balanceOf(this.accounts.user1.address, inactive1)).to.be.equal('100');
      expect(await this.staking.balanceOf(this.accounts.user2.address, inactive1)).to.be.equal('50');

      await expect(this.staking.connect(this.accounts.user1).withdraw(subjectType1, subject1))
      .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user1.address, this.accounts.user1.address, ethers.constants.AddressZero, inactive1, '100')
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '40')

      await expect(this.staking.connect(this.accounts.user2).withdraw(subjectType1, subject1))
      .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user2.address, this.accounts.user2.address, ethers.constants.AddressZero, inactive1, '50')
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '20')
    });
  });

  describe('token sweeping', async function () {
    beforeEach(async function () {
      this.accounts.getAccount('slasher');
      this.accounts.getAccount('sweeper');
      await expect(this.access.connect(this.accounts.admin).grantRole(this.roles.SLASHER, this.accounts.slasher.address)).to.be.not.reverted;
      await expect(this.access.connect(this.accounts.admin).grantRole(this.roles.SWEEPER, this.accounts.sweeper.address)).to.be.not.reverted;
      await expect(this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.sweeper.address)).to.be.not.reverted;
      await expect(this.otherToken.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.sweeper.address)).to.be.not.reverted;

      await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user1).initiateWithdrawal(subjectType1, subject1, '50')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user2).deposit(subjectType1, subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user3).reward(subjectType1, subject1, '100'))
      await expect(this.staking.connect(this.accounts.slasher).slash(subjectType1, subject1, '120')).to.be.not.reverted
    });

    it('sweep unrelated token', async function () {
      await expect(this.otherToken.connect(this.accounts.minter).mint(this.staking.address, '42')).to.be.not.reverted;

      expect(await this.token.balanceOf(this.staking.address)).to.be.equal('180');
      expect(await this.otherToken.balanceOf(this.staking.address)).to.be.equal('42');

      await expect(this.staking.connect(this.accounts.user1).sweep(this.otherToken.address, this.accounts.user1.address))
      .to.be.revertedWith(`MissingRole("${this.roles.SWEEPER}", "${this.accounts.user1.address}")`);

      await expect(this.staking.connect(this.accounts.sweeper).sweep(this.otherToken.address, this.accounts.sweeper.address))
      .to.emit(this.otherToken, 'Transfer').withArgs(this.staking.address, this.accounts.sweeper.address, '42');

      expect(await this.token.balanceOf(this.staking.address)).to.be.equal('180');
      expect(await this.otherToken.balanceOf(this.staking.address)).to.be.equal('0');

    });

    it('sweep staked token', async function () {
      expect(await this.token.balanceOf(this.staking.address)).to.be.equal('180');

      await expect(this.token.connect(this.accounts.user3).transfer(this.staking.address, '17')).to.be.not.reverted;

      expect(await this.token.balanceOf(this.staking.address)).to.be.equal('197');

      await expect(this.staking.connect(this.accounts.user1).sweep(this.token.address, this.accounts.user1.address))
      .to.be.revertedWith(`MissingRole("${this.roles.SWEEPER}", "${this.accounts.user1.address}")`);

      await expect(this.staking.connect(this.accounts.sweeper).sweep(this.token.address, this.accounts.sweeper.address))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.sweeper.address, '17');

      expect(await this.token.balanceOf(this.staking.address)).to.be.equal('180');
    });
  });

  describe('signals routing', async function () {
    beforeEach(async function () {
      this.signature = ethers.utils.id("hook_afterStakeChanged(uint8, uint256)").slice(0,10);

      this.accounts.getAccount('slasher');
      await expect(this.access.connect(this.accounts.admin).grantRole(this.roles.SLASHER, this.accounts.slasher.address)).to.be.not.reverted;
      await expect(this.access.connect(this.accounts.admin).grantRole(this.roles.ROUTER_ADMIN, this.accounts.admin.address)).to.be.not.reverted;
      await expect(this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.slasher.address)).to.be.not.reverted;
      await this.router.connect(this.accounts.admin).setRoutingTable(this.signature, this.sink.address, true, false);
    });
    
    // NOTE: skipped until the reintroduction of hooks on the Router
    it.skip('signals are emitted', async function () {
      await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '100'))
      .to.emit(this.sink, 'GotSignal').withArgs(
        this.signature + 
        ethers.utils.hexlify(ethers.utils.zeroPad(subjectType1, 32)).slice(2) +
        ethers.utils.hexlify(ethers.utils.zeroPad(subject1, 32)).slice(2)
      );

      await expect(this.staking.connect(this.accounts.slasher).slash(subjectType1, subject1, '50'))
      .to.emit(this.sink, 'GotSignal').withArgs(
        this.signature + 
        ethers.utils.hexlify(ethers.utils.zeroPad(subjectType1, 32)).slice(2) +
        ethers.utils.hexlify(ethers.utils.zeroPad(subject1, 32)).slice(2)
      );

      await expect(this.staking.connect(this.accounts.user1).initiateWithdrawal(subjectType1, subject1, '50'))
      .to.emit(this.sink, 'GotSignal').withArgs(
        this.signature + 
        ethers.utils.hexlify(ethers.utils.zeroPad(subjectType1, 32)).slice(2) +
        ethers.utils.hexlify(ethers.utils.zeroPad(subject1, 32)).slice(2)
      );
    });
  });

});
