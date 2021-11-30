const { ethers } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../../fixture');
const utils       = require('../../../scripts/utils');

const LOCKED_OFFSET = ethers.BigNumber.from(2).pow(160);
const [
  [ subject, inactive ],
] = new Array(1).fill().map(() => ethers.Wallet.createRandom()).map(({ address }) => [ address, ethers.utils.hexlify(LOCKED_OFFSET.or(ethers.BigNumber.from(address))) ]);

const txTimestamp = (tx) => tx.wait().then(({ blockNumber }) => ethers.provider.getBlock(blockNumber)).then(({ timestamp }) => timestamp);

describe('Staking Escrow', function () {
  prepare({ childChain: true });

  beforeEach(async function () {
    this.accounts.getAccount('manager');

    await Promise.all([
      this.token.connect(this.accounts.admin      ).grantRole(this.roles.WHITELISTER, this.escrowFactory.address),
      this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST,   this.accounts.manager.address),
      this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST,   this.accounts.user1.address),
      this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST,   this.accounts.user2.address),
      this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST,   this.accounts.user3.address),
      this.token.connect(this.accounts.admin).deposit(this.accounts.user1.address, ethers.utils.defaultAbiCoder.encode([ "uint256" ], [ ethers.utils.parseEther('1000') ])),
      this.token.connect(this.accounts.admin).deposit(this.accounts.user2.address, ethers.utils.defaultAbiCoder.encode([ "uint256" ], [ ethers.utils.parseEther('1000') ])),
      this.token.connect(this.accounts.admin).deposit(this.accounts.user3.address, ethers.utils.defaultAbiCoder.encode([ "uint256" ], [ ethers.utils.parseEther('1000') ])),
      this.token.connect(this.accounts.user1).approve(this.staking.address, ethers.constants.MaxUint256),
      this.token.connect(this.accounts.user2).approve(this.staking.address, ethers.constants.MaxUint256),
      this.token.connect(this.accounts.user3).approve(this.staking.address, ethers.constants.MaxUint256),
    ])
  });

  describe('with funded escrow wallet', async function () {
    beforeEach(async function () {
      this.vesting = ethers.Wallet.createRandom().address;
      this.escrow  = await this.escrowFactory.predictWallet(this.vesting, this.accounts.manager.address).then(address => utils.attach('StakingEscrow', address));

      await expect(this.token.connect(this.accounts.admin).deposit(this.escrow.address, ethers.utils.defaultAbiCoder.encode([ "uint256" ], [ ethers.utils.parseEther('1000') ])))
      .to.emit(this.token, 'RoleGranted').withArgs(this.roles.WHITELIST,         this.escrow.address, this.accounts.admin.address)
      .to.emit(this.token, 'Transfer'   ).withArgs(ethers.constants.AddressZero, this.escrow.address, ethers.utils.parseEther('1000'))
      .to.emit(this.token, 'RoleRevoked').withArgs(this.roles.WHITELIST,         this.escrow.address, this.accounts.admin.address);

      await expect(this.escrowFactory.newWallet(this.vesting, this.accounts.manager.address))
      .to.emit(this.token,         'RoleGranted'     ).withArgs(this.roles.WHITELIST, this.escrow.address, this.escrowFactory.address)
      .to.emit(this.escrowFactory, 'NewStakingEscrow').withArgs(this.escrow.address,  this.vesting,        this.accounts.manager.address);
    });

    describe('with deposit', async function () {
      beforeEach(async function () {
        this.value = ethers.utils.parseEther('1.00');

        await expect(this.escrow.connect(this.accounts.manager).functions['deposit(address,uint256)'](subject, this.value))
        .to.emit(this.token,   'Approval'      ).withArgs(this.escrow.address, this.staking.address, this.value)
        .to.emit(this.token,   'Transfer'      ).withArgs(this.escrow.address, this.staking.address, this.value)
        .to.emit(this.token,   'Approval'      ).withArgs(this.escrow.address, this.staking.address, 0)
        .to.emit(this.staking, 'TransferSingle').withArgs(this.escrow.address, ethers.constants.AddressZero, this.escrow.address, subject, this.value);
      });

      describe('with rewards', async function () {
        beforeEach(async function () {
          this.reward = ethers.utils.parseEther('0.01');

          await expect(this.staking.connect(this.accounts.user1).reward(subject, this.reward))
          .to.emit(this.staking, 'Rewarded').withArgs(subject, this.accounts.user1.address, this.reward);
        });

        it('can claim on staking', async function () {
          await expect(this.staking.releaseReward(subject, this.escrow.address))
          .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.escrow.address, this.reward)
          .to.emit(this.staking, 'Released').withArgs(subject, this.escrow.address, this.reward);

          expect(await this.escrow.pendingReward()).to.be.equal(this.reward);
        });

        it('can claim on escrow', async function () {
          await expect(this.escrow.claimReward(subject))
          .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.escrow.address, this.reward)
          .to.emit(this.staking, 'Released').withArgs(subject, this.escrow.address, this.reward);

          expect(await this.escrow.pendingReward()).to.be.equal(this.reward);
        });

        describe('with rewards claimed', async function () {
          beforeEach(async function () {
            await expect(this.escrow.claimReward(subject))
            .to.emit(this.token, 'Transfer').withArgs(this.staking.address, this.escrow.address, this.reward)
            .to.emit(this.staking, 'Released').withArgs(subject, this.escrow.address, this.reward);

            expect(await this.escrow.pendingReward()).to.be.equal(this.reward);
          });

          it('protected', async function () {
            await expect(this.escrow.releaseAllReward(this.accounts.manager.address)).to.be.revertedWith('restricted to manager');
          });

          it('authorized', async function () {
            await expect(this.escrow.connect(this.accounts.manager).release(this.token.address, this.accounts.manager.address, this.reward))
            .to.emit(this.token, 'Transfer').withArgs(this.escrow.address, this.accounts.manager.address, this.reward);

            expect(await this.escrow.pendingReward()).to.be.equal(0);
          });

          it('too much', async function () {
            await expect(this.escrow.connect(this.accounts.manager).release(this.token.address, this.accounts.manager.address, this.reward.add(1)))
            .to.be.reverted;
          });

          it('in two step', async function () {
            await expect(this.escrow.connect(this.accounts.manager).release(this.token.address, this.accounts.manager.address, this.reward.sub(1)))
            .to.emit(this.token, 'Transfer').withArgs(this.escrow.address, this.accounts.manager.address, this.reward.sub(1));

            expect(await this.escrow.pendingReward()).to.be.equal(1);

            await expect(this.escrow.connect(this.accounts.manager).release(this.token.address, this.accounts.manager.address, 1))
            .to.emit(this.token, 'Transfer').withArgs(this.escrow.address, this.accounts.manager.address, 1);

            expect(await this.escrow.pendingReward()).to.be.equal(0);
          });

          it('all', async function () {
            await expect(this.escrow.connect(this.accounts.manager).releaseAllReward(this.accounts.manager.address))
            .to.emit(this.token, 'Transfer').withArgs(this.escrow.address, this.accounts.manager.address, this.reward);

            expect(await this.escrow.pendingReward()).to.be.equal(0);
          });
        });
      });


      describe('withdrawal', function () {
        it('protected', async function () {
          await expect(this.escrow.initiateWithdrawal(subject, this.value))
          .to.be.revertedWith('restricted to manager');

          await expect(this.escrow.initiateFullWithdrawal(subject))
          .to.be.revertedWith('restricted to manager');

          await expect(this.escrow.withdraw(subject))
          .to.be.revertedWith('restricted to manager');
        });

        it('authorized', async function () {
          const tx1 = await this.escrow.connect(this.accounts.manager).initiateWithdrawal(subject, this.value);
          const tx2 = await this.escrow.connect(this.accounts.manager).withdraw(subject);

          await expect(tx1)
          .to.emit(this.staking, 'WithdrawalInitiated').withArgs(subject, this.escrow.address, await txTimestamp(tx1))
          .to.emit(this.staking, 'TransferSingle').withArgs(this.escrow.address, this.escrow.address,          ethers.constants.AddressZero, subject,  this.value)
          .to.emit(this.staking, 'TransferSingle').withArgs(this.escrow.address, ethers.constants.AddressZero, this.escrow.address,          inactive, this.value);

          await expect(tx2)
          .to.emit(this.token,   'Transfer'          ).withArgs(this.staking.address, this.escrow.address, this.value)
          .to.emit(this.staking, 'TransferSingle'    ).withArgs(this.escrow.address,  this.escrow.address, ethers.constants.AddressZero, inactive, this.value)
          .to.emit(this.staking, 'WithdrawalExecuted').withArgs(subject, this.escrow.address);
        });

        it('authorized - full', async function () {
          const tx1 = await this.escrow.connect(this.accounts.manager).initiateFullWithdrawal(subject);
          const tx2 = await this.escrow.connect(this.accounts.manager).withdraw(subject);

          await expect(tx1)
          .to.emit(this.staking, 'WithdrawalInitiated').withArgs(subject, this.escrow.address, await txTimestamp(tx1))
          .to.emit(this.staking, 'TransferSingle').withArgs(this.escrow.address, this.escrow.address,          ethers.constants.AddressZero, subject,  this.value)
          .to.emit(this.staking, 'TransferSingle').withArgs(this.escrow.address, ethers.constants.AddressZero, this.escrow.address,          inactive, this.value);

          await expect(tx2)
          .to.emit(this.token,   'Transfer'          ).withArgs(this.staking.address, this.escrow.address, this.value)
          .to.emit(this.staking, 'TransferSingle'    ).withArgs(this.escrow.address,  this.escrow.address, ethers.constants.AddressZero, inactive, this.value)
          .to.emit(this.staking, 'WithdrawalExecuted').withArgs(subject, this.escrow.address);
        });
      });
    });
  });
});
