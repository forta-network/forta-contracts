const { ethers, network } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('./fixture');

const { address: subject1 } = ethers.Wallet.createRandom();
const { address: subject2 } = ethers.Wallet.createRandom();
const { address: subject3 } = ethers.Wallet.createRandom();

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
        expect(await this.staking.stakeOf(subject1)).to.be.equal('0');
        expect(await this.staking.totalStake()).to.be.equal('0');
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('0');
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subject1)).to.be.equal('0');

        await expect(this.staking.connect(this.accounts.user1).deposit(subject1, '100'))
          .to.emit(this.token, 'Transfer').withArgs(this.accounts.user1.address, this.staking.address, '100')
          .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user1.address, ethers.constants.AddressZero, this.accounts.user1.address, subject1, '100');

        expect(await this.staking.stakeOf(subject1)).to.be.equal('100');
        expect(await this.staking.totalStake()).to.be.equal('100');
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('100');
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subject1)).to.be.equal('100');

        await expect(this.staking.connect(this.accounts.user2).deposit(subject1, '100'))
          .to.emit(this.token, 'Transfer').withArgs(this.accounts.user2.address, this.staking.address, '100')
          .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user2.address, ethers.constants.AddressZero, this.accounts.user2.address, subject1, '100');

        expect(await this.staking.stakeOf(subject1)).to.be.equal('200');
        expect(await this.staking.totalStake()).to.be.equal('200');
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('100');
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('100');
        expect(await this.staking.totalShares(subject1)).to.be.equal('200');

        await expect(this.staking.connect(this.accounts.user1).withdraw(subject1)).to.be.reverted;
        await expect(this.staking.connect(this.accounts.user2).withdraw(subject1)).to.be.reverted;

        const tx1       = await this.staking.connect(this.accounts.user1).scheduleWithdrawal(subject1, '50');
        const deadline1 = await txTimestamp(tx1);
        await expect(tx1)
          .to.emit(this.staking, 'WithdrawalSheduled').withArgs(subject1, this.accounts.user1.address, '50', deadline1);

        await expect(this.staking.connect(this.accounts.user1).withdraw(subject1))
          .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '50')
          .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user1.address, this.accounts.user1.address, ethers.constants.AddressZero, subject1, '50')
          .to.emit(this.staking, 'WithdrawalSheduled').withArgs(subject1, this.accounts.user1.address, '0', 0);

        expect(await this.staking.stakeOf(subject1)).to.be.equal('150');
        expect(await this.staking.totalStake()).to.be.equal('150');
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('50');
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('100');
        expect(await this.staking.totalShares(subject1)).to.be.equal('150');

        await expect(this.staking.connect(this.accounts.user1).withdraw(subject1)).to.be.reverted;
        await expect(this.staking.connect(this.accounts.user2).withdraw(subject1)).to.be.reverted;

        const tx2       = await this.staking.connect(this.accounts.user2).scheduleWithdrawal(subject1, '100');
        const deadline2 = await txTimestamp(tx2);
        await expect(tx2)
          .to.emit(this.staking, 'WithdrawalSheduled').withArgs(subject1, this.accounts.user2.address, '100', deadline2);

        await expect(this.staking.connect(this.accounts.user2).withdraw(subject1))
          .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '100')
          .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user2.address, this.accounts.user2.address, ethers.constants.AddressZero, subject1, '100')
          .to.emit(this.staking, 'WithdrawalSheduled').withArgs(subject1, this.accounts.user2.address, '0', 0);

        expect(await this.staking.stakeOf(subject1)).to.be.equal('50');
        expect(await this.staking.totalStake()).to.be.equal('50');
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
        expect(await this.staking.stakeOf(subject1)).to.be.equal('0');
        expect(await this.staking.totalStake()).to.be.equal('0');
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('0');
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subject1)).to.be.equal('0');

        await expect(this.staking.connect(this.accounts.user1).deposit(subject1, '100'))
          .to.emit(this.token, 'Transfer').withArgs(this.accounts.user1.address, this.staking.address, '100')
          .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user1.address, ethers.constants.AddressZero, this.accounts.user1.address, subject1, '100');

        expect(await this.staking.stakeOf(subject1)).to.be.equal('100');
        expect(await this.staking.totalStake()).to.be.equal('100');
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('100');
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subject1)).to.be.equal('100');

        await expect(this.staking.connect(this.accounts.user2).deposit(subject1, '100'))
          .to.emit(this.token, 'Transfer').withArgs(this.accounts.user2.address, this.staking.address, '100')
          .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user2.address, ethers.constants.AddressZero, this.accounts.user2.address, subject1, '100');

        expect(await this.staking.stakeOf(subject1)).to.be.equal('200');
        expect(await this.staking.totalStake()).to.be.equal('200');
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('100');
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('100');
        expect(await this.staking.totalShares(subject1)).to.be.equal('200');

        await expect(this.staking.connect(this.accounts.user1).withdraw(subject1)).to.be.reverted;
        await expect(this.staking.connect(this.accounts.user2).withdraw(subject1)).to.be.reverted;

        const tx1       = await this.staking.connect(this.accounts.user1).scheduleWithdrawal(subject1, '50');
        const deadline1 = await txTimestamp(tx1) + 3600;
        await expect(tx1)
          .to.emit(this.staking, 'WithdrawalSheduled').withArgs(subject1, this.accounts.user1.address, '50', deadline1);

        await expect(this.staking.connect(this.accounts.user1).withdraw(subject1)).to.be.reverted;

        await network.provider.send('evm_increaseTime', [ 3600 ]);

        await expect(this.staking.connect(this.accounts.user1).withdraw(subject1))
          .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '50')
          .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user1.address, this.accounts.user1.address, ethers.constants.AddressZero, subject1, '50')
          .to.emit(this.staking, 'WithdrawalSheduled').withArgs(subject1, this.accounts.user1.address, '0', 0);

        expect(await this.staking.stakeOf(subject1)).to.be.equal('150');
        expect(await this.staking.totalStake()).to.be.equal('150');
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('50');
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('100');
        expect(await this.staking.totalShares(subject1)).to.be.equal('150');

        await expect(this.staking.connect(this.accounts.user1).withdraw(subject1)).to.be.reverted;
        await expect(this.staking.connect(this.accounts.user2).withdraw(subject1)).to.be.reverted;

        const tx2       = await this.staking.connect(this.accounts.user2).scheduleWithdrawal(subject1, '100');
        const deadline2 = await txTimestamp(tx2) + 3600;
        await expect(tx2)
          .to.emit(this.staking, 'WithdrawalSheduled').withArgs(subject1, this.accounts.user2.address, '100', deadline2);

        await expect(this.staking.connect(this.accounts.user2).withdraw(subject1)).to.be.reverted;

        await network.provider.send('evm_increaseTime', [ 3600 ]);

        await expect(this.staking.connect(this.accounts.user2).withdraw(subject1))
          .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '100')
          .to.emit(this.staking, 'TransferSingle').withArgs(this.accounts.user2.address, this.accounts.user2.address, ethers.constants.AddressZero, subject1, '100')
          .to.emit(this.staking, 'WithdrawalSheduled').withArgs(subject1, this.accounts.user2.address, '0', 0);

        expect(await this.staking.stakeOf(subject1)).to.be.equal('50');
        expect(await this.staking.totalStake()).to.be.equal('50');
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

      await expect(this.staking.connect(this.accounts.user1).scheduleWithdrawal(subject1, '50')).to.be.not.reverted;
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
      this.accounts.slasher = this.accounts.shift();
      await expect(this.access.connect(this.accounts.admin).grantRole(this.roles.SLASHER, this.accounts.slasher.address)).to.be.not.reverted;
      await expect(this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.slasher.address)).to.be.not.reverted;
    });

    it('freeze → withdraw', async function () {
      await expect(this.staking.connect(this.accounts.user1).deposit(subject1, '100')).to.be.not.reverted;

      await expect(this.staking.connect(this.accounts.slasher).freeze(subject1, true))
        .to.emit(this.staking, 'Froze').withArgs(subject1, this.accounts.slasher.address, true);

        await expect(this.staking.connect(this.accounts.user1).scheduleWithdrawal(subject1, '100')).to.be.not.reverted;
        await expect(this.staking.connect(this.accounts.user1).withdraw(subject1))
          .to.be.revertedWith('Subject unstaking is currently frozen');
    });

    it('freeze → unfreeze → withdraw', async function () {
      await expect(this.staking.connect(this.accounts.user1).deposit(subject1, '100')).to.be.not.reverted;

      await expect(this.staking.connect(this.accounts.slasher).freeze(subject1, true))
        .to.emit(this.staking, 'Froze').withArgs(subject1, this.accounts.slasher.address, true);

      await expect(this.staking.connect(this.accounts.slasher).freeze(subject1, false))
        .to.emit(this.staking, 'Froze').withArgs(subject1, this.accounts.slasher.address, false);

      await expect(this.staking.connect(this.accounts.user1).scheduleWithdrawal(subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user1).withdraw(subject1))
        .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '100');
    });
  });

  describe('Slashing', function () {
    beforeEach(async function () {
      this.accounts.slasher = this.accounts.shift();
      await expect(this.access.connect(this.accounts.admin).grantRole(this.roles.SLASHER, this.accounts.slasher.address)).to.be.not.reverted;
      await expect(this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.slasher.address)).to.be.not.reverted;
    });

    it('slashing → withdraw', async function () {
      await expect(this.staking.connect(this.accounts.user1).deposit(subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user2).deposit(subject1, '50')).to.be.not.reverted;

      expect(await this.staking.stakeOf(subject1)).to.be.equal('150');
      expect(await this.staking.totalStake()).to.be.equal('150');
      expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('100');
      expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('50');
      expect(await this.staking.totalShares(subject1)).to.be.equal('150');

      await expect(this.staking.connect(this.accounts.slasher).slash(subject1, '30'))
        .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.treasure.address, '30');

      expect(await this.staking.stakeOf(subject1)).to.be.equal('120');
      expect(await this.staking.totalStake()).to.be.equal('120');
      expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('100');
      expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('50');
      expect(await this.staking.totalShares(subject1)).to.be.equal('150');

      await expect(this.staking.connect(this.accounts.user1).scheduleWithdrawal(subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user1).withdraw(subject1))
        .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '80');

      expect(await this.staking.stakeOf(subject1)).to.be.equal('40');
      expect(await this.staking.totalStake()).to.be.equal('40');
      expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('0');
      expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('50');
      expect(await this.staking.totalShares(subject1)).to.be.equal('50');

      await expect(this.staking.connect(this.accounts.user2).scheduleWithdrawal(subject1, '50')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user2).withdraw(subject1))
        .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '40');

      expect(await this.staking.stakeOf(subject1)).to.be.equal('0');
      expect(await this.staking.totalStake()).to.be.equal('0');
      expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('0');
      expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('0');
      expect(await this.staking.totalShares(subject1)).to.be.equal('0');
    });

    it('slashing → deposit', async function () {
      await expect(this.staking.connect(this.accounts.user1).deposit(subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user2).deposit(subject1, '50')).to.be.not.reverted;

      expect(await this.staking.stakeOf(subject1)).to.be.equal('150');
      expect(await this.staking.totalStake()).to.be.equal('150');
      expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('100');
      expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('50');
      expect(await this.staking.totalShares(subject1)).to.be.equal('150');

      await expect(this.staking.connect(this.accounts.slasher).slash(subject1, '30'))
        .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.treasure.address, '30');

      expect(await this.staking.stakeOf(subject1)).to.be.equal('120');
      expect(await this.staking.totalStake()).to.be.equal('120');
      expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('100');
      expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('50');
      expect(await this.staking.totalShares(subject1)).to.be.equal('150');

      await expect(this.staking.connect(this.accounts.user3).deposit(subject1, '60')).to.be.not.reverted;

      expect(await this.staking.stakeOf(subject1)).to.be.equal('180');
      expect(await this.staking.totalStake()).to.be.equal('180');
      expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('100');
      expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('50');
      expect(await this.staking.sharesOf(subject1, this.accounts.user3.address)).to.be.equal('75');
      expect(await this.staking.totalShares(subject1)).to.be.equal('225');

        await expect(this.staking.connect(this.accounts.user1).scheduleWithdrawal(subject1, '100')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user1).withdraw(subject1))
        .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '80');

      expect(await this.staking.stakeOf(subject1)).to.be.equal('100');
      expect(await this.staking.totalStake()).to.be.equal('100');
      expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('0');
      expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('50');
      expect(await this.staking.sharesOf(subject1, this.accounts.user3.address)).to.be.equal('75');
      expect(await this.staking.totalShares(subject1)).to.be.equal('125');

        await expect(this.staking.connect(this.accounts.user2).scheduleWithdrawal(subject1, '50')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user2).withdraw(subject1))
        .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '40');

      expect(await this.staking.stakeOf(subject1)).to.be.equal('60');
      expect(await this.staking.totalStake()).to.be.equal('60');
      expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('0');
      expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('0');
      expect(await this.staking.sharesOf(subject1, this.accounts.user3.address)).to.be.equal('75');
      expect(await this.staking.totalShares(subject1)).to.be.equal('75');

      await expect(this.staking.connect(this.accounts.user3).scheduleWithdrawal(subject1, '75')).to.be.not.reverted;
      await expect(this.staking.connect(this.accounts.user3).withdraw(subject1))
        .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user3.address, '60');

      expect(await this.staking.stakeOf(subject1)).to.be.equal('0');
      expect(await this.staking.totalStake()).to.be.equal('0');
      expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('0');
      expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('0');
      expect(await this.staking.totalShares(subject1)).to.be.equal('0');
    });
  });
});
