const { ethers, network } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('./fixture');

const value = ethers.utils.parseEther('1');
const { address: subject1 } = ethers.Wallet.createRandom();
const { address: subject2 } = ethers.Wallet.createRandom();
const { address: subject3 } = ethers.Wallet.createRandom();

describe('Forta Staking', function () {
  prepare();

  beforeEach(async function () {
    await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.user1.address);
    await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.user2.address);
    await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.user3.address);
    await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.minter.address);
    await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.staking.address);

    await this.token.connect(this.accounts.minter).mint(this.accounts.user1.address, value.mul(1000));
    await this.token.connect(this.accounts.minter).mint(this.accounts.user2.address, value.mul(1000));
    await this.token.connect(this.accounts.minter).mint(this.accounts.user3.address, value.mul(1000));

    await this.token.connect(this.accounts.user1).approve(this.staking.address, ethers.constants.MaxUint256);
    await this.token.connect(this.accounts.user2).approve(this.staking.address, ethers.constants.MaxUint256);
    await this.token.connect(this.accounts.user3).approve(this.staking.address, ethers.constants.MaxUint256);
  });

  describe('Stake / Unstake', function () {
    describe('no delay', function () {
      it('happy path', async function () {
        expect(await this.staking.stakeOf(subject1)).to.be.equal('0');
        expect(await this.staking.totalStake()).to.be.equal('0');
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('0');
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subject1)).to.be.equal('0');

        await expect(this.staking.connect(this.accounts.user1).stake(subject1, value))
          .to.emit(this.token, 'Transfer')
          .withArgs(this.accounts.user1.address, this.staking.address, value);

        expect(await this.staking.stakeOf(subject1)).to.be.equal(value);
        expect(await this.staking.totalStake()).to.be.equal(value);
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal(value);
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subject1)).to.be.equal(value);

        await expect(this.staking.connect(this.accounts.user2).stake(subject1, value))
          .to.emit(this.token, 'Transfer')
          .withArgs(this.accounts.user2.address, this.staking.address, value);

        expect(await this.staking.stakeOf(subject1)).to.be.equal(value.mul(2));
        expect(await this.staking.totalStake()).to.be.equal(value.mul(2));
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal(value);
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal(value);
        expect(await this.staking.totalShares(subject1)).to.be.equal(value.mul(2));

        await expect(this.staking.connect(this.accounts.user1).unstake(subject1, value.div(2)))
          .to.emit(this.token, 'Transfer')
          .withArgs(this.staking.address, this.accounts.user1.address, value.div(2));

        await expect(this.staking.connect(this.accounts.user2).unstake(subject1, value))
          .to.emit(this.token, 'Transfer')
          .withArgs(this.staking.address, this.accounts.user2.address, value);

        expect(await this.staking.stakeOf(subject1)).to.be.equal(value.div(2));
        expect(await this.staking.totalStake()).to.be.equal(value.div(2));
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal(value.div(2));
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subject1)).to.be.equal(value.div(2));
      });
    });

    describe('with delay', function () {
      beforeEach(async function () {
        await this.staking.setDelay(3600);
      });

      it('happy path', async function () {
        expect(await this.staking.stakeOf(subject1)).to.be.equal('0');
        expect(await this.staking.totalStake()).to.be.equal('0');
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('0');
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subject1)).to.be.equal('0');

        await expect(this.staking.connect(this.accounts.user1).stake(subject1, value))
          .to.emit(this.token, 'Transfer')
          .withArgs(this.accounts.user1.address, this.staking.address, value);

        expect(await this.staking.stakeOf(subject1)).to.be.equal(value);
        expect(await this.staking.totalStake()).to.be.equal(value);
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal(value);
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subject1)).to.be.equal(value);

        await expect(this.staking.connect(this.accounts.user2).stake(subject1, value))
          .to.emit(this.token, 'Transfer')
          .withArgs(this.accounts.user2.address, this.staking.address, value);

        expect(await this.staking.stakeOf(subject1)).to.be.equal(value.mul(2));
        expect(await this.staking.totalStake()).to.be.equal(value.mul(2));
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal(value);
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal(value);
        expect(await this.staking.totalShares(subject1)).to.be.equal(value.mul(2));

        await expect(this.staking.connect(this.accounts.user1).unstake(subject1, value.div(2))).to.be.reverted;
        await expect(this.staking.connect(this.accounts.user2).unstake(subject1, value.div(2))).to.be.reverted;

        await this.staking.connect(this.accounts.user1).scheduleUnstake(subject1, value.div(2));

        await expect(this.staking.connect(this.accounts.user1).unstake(subject1, value.div(2))).to.be.reverted;
        await expect(this.staking.connect(this.accounts.user2).unstake(subject1, value.div(2))).to.be.reverted;

        await network.provider.send('evm_increaseTime', [ 3600 ]);

        await expect(this.staking.connect(this.accounts.user1).unstake(subject1, value.div(2)))
          .to.emit(this.token, 'Transfer')
          .withArgs(this.staking.address, this.accounts.user1.address, value.div(2));
        await expect(this.staking.connect(this.accounts.user2).unstake(subject1, value.div(2))).to.be.reverted;

        await this.staking.connect(this.accounts.user2).scheduleUnstake(subject1, value);
        await network.provider.send('evm_increaseTime', [ 3600 ]);

        await expect(this.staking.connect(this.accounts.user2).unstake(subject1, value))
          .to.emit(this.token, 'Transfer')
          .withArgs(this.staking.address, this.accounts.user2.address, value);

        expect(await this.staking.stakeOf(subject1)).to.be.equal(value.div(2));
        expect(await this.staking.totalStake()).to.be.equal(value.div(2));
        expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal(value.div(2));
        expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('0');
        expect(await this.staking.totalShares(subject1)).to.be.equal(value.div(2));
      });
    });
  });

  describe('Rewards', function () {
    it ('fix shares', async function () {
      await this.staking.connect(this.accounts.user1).stake(subject1, '100');
      await this.staking.connect(this.accounts.user2).stake(subject1, '50');

      expect(await this.staking.sharesOf(subject1, this.accounts.user1.address)).to.be.equal('100');
      expect(await this.staking.sharesOf(subject1, this.accounts.user2.address)).to.be.equal('50');
      expect(await this.staking.totalShares(subject1)).to.be.equal('150');

      expect(await this.staking.toRelease(subject1, this.accounts.user1.address)).to.be.equal('0');
      await expect(this.staking.release(subject1, this.accounts.user1.address)).to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '0');

      expect(await this.staking.toRelease(subject1, this.accounts.user1.address)).to.be.equal('0');
      await expect(this.staking.release(subject1, this.accounts.user2.address)).to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '0');

      await this.staking.connect(this.accounts.user3).reward(subject1, '60');

      expect(await this.staking.toRelease(subject1, this.accounts.user1.address)).to.be.equal('40');
      await expect(this.staking.release(subject1, this.accounts.user1.address)).to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '40');

      await this.staking.connect(this.accounts.user3).reward(subject1, '15');

      expect(await this.staking.toRelease(subject1, this.accounts.user1.address)).to.be.equal('10');
      await expect(this.staking.release(subject1, this.accounts.user1.address)).to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '10');

      expect(await this.staking.toRelease(subject1, this.accounts.user2.address)).to.be.equal('25');
      await expect(this.staking.release(subject1, this.accounts.user2.address)).to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '25');
    });

    it ('increassing shares', async function () {
      await this.staking.connect(this.accounts.user1).stake(subject1, '50');
      await this.staking.connect(this.accounts.user2).stake(subject1, '50');

      expect(await this.staking.toRelease(subject1, this.accounts.user1.address)).to.be.equal('0');
      expect(await this.staking.toRelease(subject1, this.accounts.user1.address)).to.be.equal('0');

      await this.staking.connect(this.accounts.user3).reward(subject1, '60');

      expect(await this.staking.toRelease(subject1, this.accounts.user1.address)).to.be.equal('30');
      expect(await this.staking.toRelease(subject1, this.accounts.user1.address)).to.be.equal('30');

      await this.staking.connect(this.accounts.user1).stake(subject1, '50');

      expect(await this.staking.toRelease(subject1, this.accounts.user1.address)).to.be.equal('30');
      expect(await this.staking.toRelease(subject1, this.accounts.user1.address)).to.be.equal('30');

      await this.staking.connect(this.accounts.user3).reward(subject1, '15');

      expect(await this.staking.toRelease(subject1, this.accounts.user1.address)).to.be.equal('40');
      expect(await this.staking.toRelease(subject1, this.accounts.user2.address)).to.be.equal('35');

      await expect(this.staking.release(subject1, this.accounts.user1.address)).to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '40');
      await expect(this.staking.release(subject1, this.accounts.user2.address)).to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '35');
    });

    it ('decrease shares', async function () {
      await this.staking.connect(this.accounts.user1).stake(subject1, '100');
      await this.staking.connect(this.accounts.user2).stake(subject1, '50');

      expect(await this.staking.toRelease(subject1, this.accounts.user1.address)).to.be.equal('0');
      expect(await this.staking.toRelease(subject1, this.accounts.user1.address)).to.be.equal('0');

      await this.staking.connect(this.accounts.user3).reward(subject1, '60');

      expect(await this.staking.toRelease(subject1, this.accounts.user1.address)).to.be.equal('40');
      expect(await this.staking.toRelease(subject1, this.accounts.user2.address)).to.be.equal('20');

      await this.staking.connect(this.accounts.user1).unstake(subject1, '50');

      expect(await this.staking.toRelease(subject1, this.accounts.user1.address)).to.be.equal('40');
      expect(await this.staking.toRelease(subject1, this.accounts.user2.address)).to.be.equal('20');

      await this.staking.connect(this.accounts.user3).reward(subject1, '40');

      expect(await this.staking.toRelease(subject1, this.accounts.user1.address)).to.be.equal('60');
      expect(await this.staking.toRelease(subject1, this.accounts.user2.address)).to.be.equal('40');

      await expect(this.staking.release(subject1, this.accounts.user1.address)).to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '60');
      await expect(this.staking.release(subject1, this.accounts.user2.address)).to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '40');
    });

    it ('transfer shares', async function () {
      await this.staking.connect(this.accounts.user1).stake(subject1, '100');
      await this.staking.connect(this.accounts.user2).stake(subject1, '50');

      expect(await this.staking.toRelease(subject1, this.accounts.user1.address)).to.be.equal('0');
      expect(await this.staking.toRelease(subject1, this.accounts.user1.address)).to.be.equal('0');

      await this.staking.connect(this.accounts.user3).reward(subject1, '60');

      expect(await this.staking.toRelease(subject1, this.accounts.user1.address)).to.be.equal('40');
      expect(await this.staking.toRelease(subject1, this.accounts.user2.address)).to.be.equal('20');

      await this.staking.connect(this.accounts.user1).transfer(subject1, this.accounts.user2.address, '50');

      expect(await this.staking.toRelease(subject1, this.accounts.user1.address)).to.be.equal('40');
      expect(await this.staking.toRelease(subject1, this.accounts.user2.address)).to.be.equal('20');

      await this.staking.connect(this.accounts.user3).reward(subject1, '30');

      expect(await this.staking.toRelease(subject1, this.accounts.user1.address)).to.be.equal('50');
      expect(await this.staking.toRelease(subject1, this.accounts.user2.address)).to.be.equal('40');

      await expect(this.staking.release(subject1, this.accounts.user1.address)).to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user1.address, '50');
      await expect(this.staking.release(subject1, this.accounts.user2.address)).to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.accounts.user2.address, '40');
    });
  });
});
