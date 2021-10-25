const { ethers, network } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');

const LOCKED_OFFSET = ethers.BigNumber.from(2).pow(160);
const [
  [ subject1, inactive1 ],
  [ subject2, inactive2 ],
  [ subject3, inactive3 ],
] = new Array(3).fill().map(() => ethers.Wallet.createRandom()).map(({ address }) => [ address, ethers.utils.hexlify(LOCKED_OFFSET.or(ethers.BigNumber.from(address))) ]);

const txTimestamp = (tx) => tx.wait().then(({ blockNumber }) => ethers.provider.getBlock(blockNumber)).then(({ timestamp }) => timestamp);

describe('Forta Staking', function () {
  prepare();

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
  });

  describe('Deposit / Withdraw', function () {
    describe('no delay', function () {
      it('happy path', async function () {
        expect(await this.staking.activeStakeFor(subject1)).to.be.equal('0');
        expect(await this.staking.totalActiveStake()).to.be.equal('0');
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('0');
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subject1)).to.be.equal('0');

        await expect(this.staking.connect(this.accounts.user1).deposit(subject1, '100'))
        .to.emit(this.token, 'Transfer').withArgs(this.accounts.user1.address, this.staking.address, '100')
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user1.address, ethers.constants.AddressZero, this.accounts.user1.address, subject1, '100');

        expect(await this.staking.activeStakeFor(subject1)).to.be.equal('100');
        expect(await this.staking.totalActiveStake()).to.be.equal('100');
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('100');
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subject1)).to.be.equal('100');

        await expect(this.staking.connect(this.accounts.user2).deposit(subject1, '100'))
        .to.emit(this.token, 'Transfer').withArgs(this.accounts.user2.address, this.staking.address, '100')
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user2.address, ethers.constants.AddressZero, this.accounts.user2.address, subject1, '100');

        expect(await this.staking.activeStakeFor(subject1)).to.be.equal('200');
        expect(await this.staking.totalActiveStake()).to.be.equal('200');
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('100');
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('100');
        expect(await this.staking.totalShares(subject1)).to.be.equal('200');

        await expect(this.staking.connect(this.accounts.user1).withdraw(subject1)).to.be.reverted;
        await expect(this.staking.connect(this.accounts.user2).withdraw(subject1)).to.be.reverted;

        const tx1 = await this.staking.connect(this.accounts.user1).initiateWithdrawal(subject1, '50');
        await expect(tx1)
        .to.emit(this.staking, 'WithdrawalInitiated').withArgs(subject1, this.accounts.user1.address, await txTimestamp(tx1))
        .to.emit(this.staking, 'TransferSingle')/*.withArgs(this.accounts.user1.address, this.accounts.user1.address, ethers.constants.AddressZero, subject1, '50')*/
        .to.emit(this.staking, 'TransferSingle')/*.withArgs(this.accounts.user1.address, ethers.constants.AddressZero, this.accounts.user1.address, inactive1, '50')*/

        await expect(this.staking.connect(this.accounts.user1).withdraw(subject1))
        .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '50')
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user1.address, this.accounts.user1.address, ethers.constants.AddressZero, inactive1, '50')
        .to.emit(this.staking, 'WithdrawalExecuted').withArgs(subject1, this.accounts.user1.address);

        expect(await this.staking.activeStakeFor(subject1)).to.be.equal('150');
        expect(await this.staking.totalActiveStake()).to.be.equal('150');
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('50');
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('100');
        expect(await this.staking.totalShares(subject1)).to.be.equal('150');

        await expect(this.staking.connect(this.accounts.user1).withdraw(subject1)).to.be.reverted;
        await expect(this.staking.connect(this.accounts.user2).withdraw(subject1)).to.be.reverted;

        const tx2 = await this.staking.connect(this.accounts.user2).initiateWithdrawal(subject1, '100');
        await expect(tx2)
        .to.emit(this.staking, 'WithdrawalInitiated').withArgs(subject1, this.accounts.user2.address, await txTimestamp(tx2))
        .to.emit(this.staking, 'TransferSingle')/*.withArgs(this.accounts.user2.address, this.accounts.user2.address, ethers.constants.AddressZero, subject1, '100')*/
        .to.emit(this.staking, 'TransferSingle')/*.withArgs(this.accounts.user2.address, ethers.constants.AddressZero, this.accounts.user2.address, inactive1, '100')*/

        await expect(this.staking.connect(this.accounts.user2).withdraw(subject1))
        .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '100')
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user2.address, this.accounts.user2.address, ethers.constants.AddressZero, inactive1, '100')
        .to.emit(this.staking, 'WithdrawalExecuted').withArgs(subject1, this.accounts.user2.address);

        expect(await this.staking.activeStakeFor(subject1)).to.be.equal('50');
        expect(await this.staking.totalActiveStake()).to.be.equal('50');
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('50');
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subject1)).to.be.equal('50');

        await expect(this.staking.connect(this.accounts.user1).withdraw(subject1)).to.be.reverted;
        await expect(this.staking.connect(this.accounts.user2).withdraw(subject1)).to.be.reverted;
      });
    });

    describe('with delay', function () {
      beforeEach(async function () {
        await expect(this.staking.setDelay(3600))
        .to.emit(this.staking, 'DelaySet').withArgs(3600)
      });

      it('happy path', async function () {
        expect(await this.staking.activeStakeFor(subject1)).to.be.equal('0');
        expect(await this.staking.totalActiveStake()).to.be.equal('0');
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('0');
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subject1)).to.be.equal('0');

        await expect(this.staking.connect(this.accounts.user1).deposit(subject1, '100'))
        .to.emit(this.token, 'Transfer').withArgs(this.accounts.user1.address, this.staking.address, '100')
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user1.address, ethers.constants.AddressZero, this.accounts.user1.address, subject1, '100');

        expect(await this.staking.activeStakeFor(subject1)).to.be.equal('100');
        expect(await this.staking.totalActiveStake()).to.be.equal('100');
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('100');
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subject1)).to.be.equal('100');

        await expect(this.staking.connect(this.accounts.user2).deposit(subject1, '100'))
        .to.emit(this.token, 'Transfer').withArgs(this.accounts.user2.address, this.staking.address, '100')
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user2.address, ethers.constants.AddressZero, this.accounts.user2.address, subject1, '100');

        expect(await this.staking.activeStakeFor(subject1)).to.be.equal('200');
        expect(await this.staking.totalActiveStake()).to.be.equal('200');
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('100');
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('100');
        expect(await this.staking.totalShares(subject1)).to.be.equal('200');

        await expect(this.staking.connect(this.accounts.user1).withdraw(subject1)).to.be.reverted;
        await expect(this.staking.connect(this.accounts.user2).withdraw(subject1)).to.be.reverted;

        const tx1 = await this.staking.connect(this.accounts.user1).initiateWithdrawal(subject1, '50');
        await expect(tx1)
        .to.emit(this.staking, 'WithdrawalInitiated').withArgs(subject1, this.accounts.user1.address, await txTimestamp(tx1) + 3600)
        .to.emit(this.staking, 'TransferSingle')/*.withArgs(this.accounts.user2.address, this.accounts.user2.address, ethers.constants.AddressZero, subject1, '100')*/
        .to.emit(this.staking, 'TransferSingle')/*.withArgs(this.accounts.user2.address, ethers.constants.AddressZero, this.accounts.user2.address, inactive1, '100')*/

        await expect(this.staking.connect(this.accounts.user1).withdraw(subject1)).to.be.reverted;

        await network.provider.send('evm_increaseTime', [ 3600 ]);

        await expect(this.staking.connect(this.accounts.user1).withdraw(subject1))
        .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '50')
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user1.address, this.accounts.user1.address, ethers.constants.AddressZero, inactive1, '50')
        .to.emit(this.staking, 'WithdrawalExecuted').withArgs(subject1, this.accounts.user1.address);

        expect(await this.staking.activeStakeFor(subject1)).to.be.equal('150');
        expect(await this.staking.totalActiveStake()).to.be.equal('150');
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('50');
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('100');
        expect(await this.staking.totalShares(subject1)).to.be.equal('150');

        await expect(this.staking.connect(this.accounts.user1).withdraw(subject1)).to.be.reverted;
        await expect(this.staking.connect(this.accounts.user2).withdraw(subject1)).to.be.reverted;

        const tx2 = await this.staking.connect(this.accounts.user2).initiateWithdrawal(subject1, '100');
        await expect(tx2)
        .to.emit(this.staking, 'WithdrawalInitiated').withArgs(subject1, this.accounts.user2.address, await txTimestamp(tx2) + 3600)
        .to.emit(this.staking, 'TransferSingle')/*.withArgs(this.accounts.user2.address, this.accounts.user2.address, ethers.constants.AddressZero, subject1, '100')*/
        .to.emit(this.staking, 'TransferSingle')/*.withArgs(this.accounts.user2.address, ethers.constants.AddressZero, this.accounts.user2.address, inactive1, '100')*/

        await expect(this.staking.connect(this.accounts.user2).withdraw(subject1)).to.be.reverted;

        await network.provider.send('evm_increaseTime', [ 3600 ]);

        await expect(this.staking.connect(this.accounts.user2).withdraw(subject1))
        .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '100')
        .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user2.address, this.accounts.user2.address, ethers.constants.AddressZero, inactive1, '100')
        .to.emit(this.staking, 'WithdrawalExecuted').withArgs(subject1, this.accounts.user2.address);

        expect(await this.staking.activeStakeFor(subject1)).to.be.equal('50');
        expect(await this.staking.totalActiveStake()).to.be.equal('50');
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('50');
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subject1)).to.be.equal('50');

        await expect(this.staking.connect(this.accounts.user1).withdraw(subject1)).to.be.reverted;
        await expect(this.staking.connect(this.accounts.user2).withdraw(subject1)).to.be.reverted;
      });
    });
  });

  describe('Rewards', function () {
    it('fix shares', async function () {
      await expect(this.staking.connect(this.accounts.user1).deposit(subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user2).deposit(subject1, '50')).to.be.not.reverted;

      expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('100');
      expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('50');
      expect(await this.staking.totalShares(subject1)).to.be.equal('150');

      expect(await this.staking.availableReward(subject1, this.accounts.user1.address)).to.be.equal('0');
      await expect(this.staking.releaseReward(subject1, this.accounts.user1.address))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '0')
      .to.emit(this.staking, 'Released').withArgs(subject1, this.accounts.user1.address, '0');

      expect(await this.staking.availableReward(subject1, this.accounts.user1.address)).to.be.equal('0');
      await expect(this.staking.releaseReward(subject1, this.accounts.user2.address))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '0')
      .to.emit(this.staking, 'Released').withArgs(subject1, this.accounts.user2.address, '0');

      await expect(this.staking.connect(this.accounts.user3).reward(subject1, '60'))
      .to.emit(this.staking, 'Rewarded').withArgs(subject1, this.accounts.user3.address, '60');

      expect(await this.staking.availableReward(subject1, this.accounts.user1.address)).to.be.equal('40');
      await expect(this.staking.releaseReward(subject1, this.accounts.user1.address))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '40')
      .to.emit(this.staking, 'Released').withArgs(subject1, this.accounts.user1.address, '40');

      await expect(this.staking.connect(this.accounts.user3).reward(subject1, '15'))
      .to.emit(this.staking, 'Rewarded').withArgs(subject1, this.accounts.user3.address, '15');

      expect(await this.staking.availableReward(subject1, this.accounts.user1.address)).to.be.equal('10');
      await expect(this.staking.releaseReward(subject1, this.accounts.user1.address))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '10')
      .to.emit(this.staking, 'Released').withArgs(subject1, this.accounts.user1.address, '10');

      expect(await this.staking.availableReward(subject1, this.accounts.user2.address)).to.be.equal('25');
      await expect(this.staking.releaseReward(subject1, this.accounts.user2.address))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '25')
      .to.emit(this.staking, 'Released').withArgs(subject1, this.accounts.user2.address, '25');
    });

    it('increassing shares', async function () {
      await expect(this.staking.connect(this.accounts.user1).deposit(subject1, '50')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user2).deposit(subject1, '50')).to.be.not.reverted;

      expect(await this.staking.availableReward(subject1, this.accounts.user1.address)).to.be.equal('0');
      expect(await this.staking.availableReward(subject1, this.accounts.user1.address)).to.be.equal('0');

      await expect(this.staking.connect(this.accounts.user3).reward(subject1, '60'))
      .to.emit(this.staking, 'Rewarded').withArgs(subject1, this.accounts.user3.address, '60');

      expect(await this.staking.availableReward(subject1, this.accounts.user1.address)).to.be.equal('30');
      expect(await this.staking.availableReward(subject1, this.accounts.user1.address)).to.be.equal('30');

      await expect(this.staking.connect(this.accounts.user1).deposit(subject1, '50')).to.be.not.reverted;

      expect(await this.staking.availableReward(subject1, this.accounts.user1.address)).to.be.equal('30');
      expect(await this.staking.availableReward(subject1, this.accounts.user1.address)).to.be.equal('30');

      await expect(this.staking.connect(this.accounts.user3).reward(subject1, '15')).to.be.not.reverted;

      expect(await this.staking.availableReward(subject1, this.accounts.user1.address)).to.be.equal('40');
      expect(await this.staking.availableReward(subject1, this.accounts.user2.address)).to.be.equal('35');

      await expect(this.staking.releaseReward(subject1, this.accounts.user1.address))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '40');
      await expect(this.staking.releaseReward(subject1, this.accounts.user2.address))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '35');
    });

    it('decrease shares', async function () {
      await expect(this.staking.connect(this.accounts.user1).deposit(subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user2).deposit(subject1, '50')).to.be.not.reverted;

      expect(await this.staking.availableReward(subject1, this.accounts.user1.address)).to.be.equal('0');
      expect(await this.staking.availableReward(subject1, this.accounts.user1.address)).to.be.equal('0');

      await expect(this.staking.connect(this.accounts.user3).reward(subject1, '60')).to.be.not.reverted;

      expect(await this.staking.availableReward(subject1, this.accounts.user1.address)).to.be.equal('40');
      expect(await this.staking.availableReward(subject1, this.accounts.user2.address)).to.be.equal('20');

      await expect(this.staking.connect(this.accounts.user1).initiateWithdrawal(subject1, '50')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user1).withdraw(subject1)).to.be.not.reverted;

      expect(await this.staking.availableReward(subject1, this.accounts.user1.address)).to.be.equal('40');
      expect(await this.staking.availableReward(subject1, this.accounts.user2.address)).to.be.equal('20');

      await expect(this.staking.connect(this.accounts.user3).reward(subject1, '40')).to.be.not.reverted;

      expect(await this.staking.availableReward(subject1, this.accounts.user1.address)).to.be.equal('60');
      expect(await this.staking.availableReward(subject1, this.accounts.user2.address)).to.be.equal('40');

      await expect(this.staking.releaseReward(subject1, this.accounts.user1.address))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '60');
      await expect(this.staking.releaseReward(subject1, this.accounts.user2.address))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '40');
    });

    it('transfer shares', async function () {
      await expect(this.staking.connect(this.accounts.user1).deposit(subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user2).deposit(subject1, '50')).to.be.not.reverted;

      expect(await this.staking.availableReward(subject1, this.accounts.user1.address)).to.be.equal('0');
      expect(await this.staking.availableReward(subject1, this.accounts.user1.address)).to.be.equal('0');

      await expect(this.staking.connect(this.accounts.user3).reward(subject1, '60')).to.be.not.reverted;

      expect(await this.staking.availableReward(subject1, this.accounts.user1.address)).to.be.equal('40');
      expect(await this.staking.availableReward(subject1, this.accounts.user2.address)).to.be.equal('20');

      await expect(this.staking.connect(this.accounts.user1).safeTransferFrom(this.accounts.user1.address, this.accounts.user2.address, subject1, '50', "0x")).to.be.not.reverted;

      expect(await this.staking.availableReward(subject1, this.accounts.user1.address)).to.be.equal('40');
      expect(await this.staking.availableReward(subject1, this.accounts.user2.address)).to.be.equal('20');

      await expect(this.staking.connect(this.accounts.user3).reward(subject1, '30')).to.be.not.reverted;

      expect(await this.staking.availableReward(subject1, this.accounts.user1.address)).to.be.equal('50');
      expect(await this.staking.availableReward(subject1, this.accounts.user2.address)).to.be.equal('40');

      await expect(this.staking.releaseReward(subject1, this.accounts.user1.address))
        .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '50');
      await expect(this.staking.releaseReward(subject1, this.accounts.user2.address))
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
      await expect(this.staking.connect(this.accounts.user1).deposit(subject1, '100')).to.be.not.reverted;

      await expect(this.staking.connect(this.accounts.slasher).freeze(subject1, true))
      .to.emit(this.staking, 'Froze').withArgs(subject1, this.accounts.slasher.address, true);

      await expect(this.staking.connect(this.accounts.user1).initiateWithdrawal(subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user1).withdraw(subject1))
      .to.be.revertedWith('Subject unstaking is currently frozen');
    });

    it('freeze → unfreeze → withdraw', async function () {
      await expect(this.staking.connect(this.accounts.user1).deposit(subject1, '100')).to.be.not.reverted;

      await expect(this.staking.connect(this.accounts.slasher).freeze(subject1, true))
      .to.emit(this.staking, 'Froze').withArgs(subject1, this.accounts.slasher.address, true);

      await expect(this.staking.connect(this.accounts.slasher).freeze(subject1, false))
      .to.emit(this.staking, 'Froze').withArgs(subject1, this.accounts.slasher.address, false);

      await expect(this.staking.connect(this.accounts.user1).initiateWithdrawal(subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user1).withdraw(subject1))
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
      await expect(this.staking.connect(this.accounts.user1).deposit(subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user2).deposit(subject1, '50')).to.be.not.reverted;

      expect(await this.staking.activeStakeFor(subject1)).to.be.equal('150');
      expect(await this.staking.totalActiveStake()).to.be.equal('150');
      expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('100');
      expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('50');
      expect(await this.staking.totalShares(subject1)).to.be.equal('150');

      await expect(this.staking.connect(this.accounts.slasher).slash(subject1, '30'))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.treasure.address, '30');

      expect(await this.staking.activeStakeFor(subject1)).to.be.equal('120');
      expect(await this.staking.totalActiveStake()).to.be.equal('120');
      expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('100');
      expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('50');
      expect(await this.staking.totalShares(subject1)).to.be.equal('150');

      await expect(this.staking.connect(this.accounts.user1).initiateWithdrawal(subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user1).withdraw(subject1))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '80');

      expect(await this.staking.activeStakeFor(subject1)).to.be.equal('40');
      expect(await this.staking.totalActiveStake()).to.be.equal('40');
      expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('0');
      expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('50');
      expect(await this.staking.totalShares(subject1)).to.be.equal('50');

      await expect(this.staking.connect(this.accounts.user2).initiateWithdrawal(subject1, '50')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user2).withdraw(subject1))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '40');

      expect(await this.staking.activeStakeFor(subject1)).to.be.equal('0');
      expect(await this.staking.totalActiveStake()).to.be.equal('0');
      expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('0');
      expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('0');
      expect(await this.staking.totalShares(subject1)).to.be.equal('0');
    });

    it('slashing → deposit', async function () {
      await expect(this.staking.connect(this.accounts.user1).deposit(subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user2).deposit(subject1, '50')).to.be.not.reverted;

      expect(await this.staking.activeStakeFor(subject1)).to.be.equal('150');
      expect(await this.staking.totalActiveStake()).to.be.equal('150');
      expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('100');
      expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('50');
      expect(await this.staking.totalShares(subject1)).to.be.equal('150');

      await expect(this.staking.connect(this.accounts.slasher).slash(subject1, '30'))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.treasure.address, '30');

      expect(await this.staking.activeStakeFor(subject1)).to.be.equal('120');
      expect(await this.staking.totalActiveStake()).to.be.equal('120');
      expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('100');
      expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('50');
      expect(await this.staking.totalShares(subject1)).to.be.equal('150');

      await expect(this.staking.connect(this.accounts.user3).deposit(subject1, '60')).to.be.not.reverted;

      expect(await this.staking.activeStakeFor(subject1)).to.be.equal('180');
      expect(await this.staking.totalActiveStake()).to.be.equal('180');
      expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('100');
      expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('50');
      expect(await this.staking.sharesOf(subject1, this.accounts.user3.address)).to.be.equal('75');
      expect(await this.staking.totalShares(subject1)).to.be.equal('225');

      await expect(this.staking.connect(this.accounts.user1).initiateWithdrawal(subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user1).withdraw(subject1))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '80');

      expect(await this.staking.activeStakeFor(subject1)).to.be.equal('100');
      expect(await this.staking.totalActiveStake()).to.be.equal('100');
      expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('0');
      expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('50');
      expect(await this.staking.sharesOf(subject1, this.accounts.user3.address)).to.be.equal('75');
      expect(await this.staking.totalShares(subject1)).to.be.equal('125');

      await expect(this.staking.connect(this.accounts.user2).initiateWithdrawal(subject1, '50')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user2).withdraw(subject1))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '40');

      expect(await this.staking.activeStakeFor(subject1)).to.be.equal('60');
      expect(await this.staking.totalActiveStake()).to.be.equal('60');
      expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('0');
      expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('0');
      expect(await this.staking.sharesOf(subject1, this.accounts.user3.address)).to.be.equal('75');
      expect(await this.staking.totalShares(subject1)).to.be.equal('75');

      await expect(this.staking.connect(this.accounts.user3).initiateWithdrawal(subject1, '75')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user3).withdraw(subject1))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user3.address, '60');

      expect(await this.staking.activeStakeFor(subject1)).to.be.equal('0');
      expect(await this.staking.totalActiveStake()).to.be.equal('0');
      expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('0');
      expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('0');
      expect(await this.staking.totalShares(subject1)).to.be.equal('0');
    });

    it('initiate → slashing → withdraw', async function () {
      await expect(this.staking.connect(this.accounts.user1).deposit(subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user2).deposit(subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user1).initiateWithdrawal(subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user2).initiateWithdrawal(subject1, '50')).to.be.not.reverted;

      expect(await this.staking.activeStakeFor(subject1)).to.be.equal('50');
      expect(await this.staking.inactiveStakeFor(subject1)).to.be.equal('150');
      expect(await this.staking.balanceOf(this.accounts.user1.address, subject1)).to.be.equal('0');
      expect(await this.staking.balanceOf(this.accounts.user2.address, subject1)).to.be.equal('50');
      expect(await this.staking.balanceOf(this.accounts.user1.address, inactive1)).to.be.equal('100');
      expect(await this.staking.balanceOf(this.accounts.user2.address, inactive1)).to.be.equal('50');

      await expect(this.staking.connect(this.accounts.slasher).slash(subject1, '120'))
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.treasure.address, '120');

      expect(await this.staking.activeStakeFor(subject1)).to.be.equal('20');
      expect(await this.staking.inactiveStakeFor(subject1)).to.be.equal('60');
      expect(await this.staking.balanceOf(this.accounts.user1.address, subject1)).to.be.equal('0');
      expect(await this.staking.balanceOf(this.accounts.user2.address, subject1)).to.be.equal('50');
      expect(await this.staking.balanceOf(this.accounts.user1.address, inactive1)).to.be.equal('100');
      expect(await this.staking.balanceOf(this.accounts.user2.address, inactive1)).to.be.equal('50');

      await expect(this.staking.connect(this.accounts.user1).withdraw(subject1))
      .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user1.address, this.accounts.user1.address, ethers.constants.AddressZero, inactive1, '100')
      .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '40')

      await expect(this.staking.connect(this.accounts.user2).withdraw(subject1))
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

      await expect(this.staking.connect(this.accounts.user1).deposit(subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user1).initiateWithdrawal(subject1, '50')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user2).deposit(subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user3).reward(subject1, '100'))
      await expect(this.staking.connect(this.accounts.slasher).slash(subject1, '120')).to.be.not.reverted
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
      this.signature = ethers.utils.id("hook_afterStakeChanged(address)").slice(0,10);

      this.accounts.getAccount('slasher');
      await expect(this.access.connect(this.accounts.admin).grantRole(this.roles.SLASHER, this.accounts.slasher.address)).to.be.not.reverted;
      await expect(this.access.connect(this.accounts.admin).grantRole(this.roles.ROUTER_ADMIN, this.accounts.admin.address)).to.be.not.reverted;
      await expect(this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.slasher.address)).to.be.not.reverted;
      await this.router.connect(this.accounts.admin).setRoutingTable(this.signature, this.sink.address, true);
    });

    it('signals are emitted', async function () {
      await expect(this.staking.connect(this.accounts.user1).deposit(subject1, '100'))
      .to.emit(this.sink, 'GotSignal').withArgs(this.signature + ethers.utils.hexlify(ethers.utils.zeroPad(subject1, 32)).slice(2));

      await expect(this.staking.connect(this.accounts.slasher).slash(subject1, '50'))
      .to.emit(this.sink, 'GotSignal').withArgs(this.signature + ethers.utils.hexlify(ethers.utils.zeroPad(subject1, 32)).slice(2));

      await expect(this.staking.connect(this.accounts.slasher).initiateWithdrawal(subject1, '50'))
      .to.emit(this.sink, 'GotSignal').withArgs(this.signature + ethers.utils.hexlify(ethers.utils.zeroPad(subject1, 32)).slice(2));
    });
  });
});
