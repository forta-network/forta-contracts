const { ethers } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../../fixture');
const utils = require('../../../scripts/utils');
const { subjectToActive, subjectToInactive } = require('../../../scripts/utils/staking.js');

const subjects = [
    [1, 3], // ScannerPool id, ScannerPool type
];
const [[subject, subjectType, active, inactive]] = subjects.map((items) => [items[0], items[1], subjectToActive(items[1], items[0]), subjectToInactive(items[1], items[0])]);
const txTimestamp = (tx) =>
    tx
        .wait()
        .then(({ blockNumber }) => ethers.provider.getBlock(blockNumber))
        .then(({ timestamp }) => timestamp);

describe('Staking Escrow', function () {
    prepare({
        adminAsChildChainManagerProxy: true,
        stake: { min: '1', max: ethers.utils.parseEther('10000000'), activated: true },
    });

    beforeEach(async function () {
        this.accounts.getAccount('manager');
        await this.scannerPools.connect(this.accounts.user1).registerScannerPool();

        await Promise.all([
            this.token.connect(this.accounts.admin).grantRole(ethers.utils.id('WHITELISTER_ROLE'), this.escrowFactory.address),
            this.token.connect(this.accounts.admin).deposit(this.accounts.user1.address, ethers.utils.defaultAbiCoder.encode(['uint256'], [ethers.utils.parseEther('1000')])),
            this.token.connect(this.accounts.admin).deposit(this.accounts.user2.address, ethers.utils.defaultAbiCoder.encode(['uint256'], [ethers.utils.parseEther('1000')])),
            this.token.connect(this.accounts.admin).deposit(this.accounts.user3.address, ethers.utils.defaultAbiCoder.encode(['uint256'], [ethers.utils.parseEther('1000')])),
            this.token.connect(this.accounts.user1).approve(this.staking.address, ethers.constants.MaxUint256),
            this.token.connect(this.accounts.user2).approve(this.staking.address, ethers.constants.MaxUint256),
            this.token.connect(this.accounts.user3).approve(this.staking.address, ethers.constants.MaxUint256),
        ]);

    });

    describe('with funded escrow wallet', async function () {
        beforeEach(async function () {
            this.vesting = ethers.Wallet.createRandom().address;
            this.escrow = await this.escrowFactory.predictWallet(this.vesting, this.accounts.manager.address).then((address) => utils.attach('StakingEscrow', address));

            await expect(this.token.connect(this.accounts.admin).deposit(this.escrow.address, ethers.utils.defaultAbiCoder.encode(['uint256'], [ethers.utils.parseEther('1000')])))
                .to.emit(this.token, 'Transfer')
                .withArgs(ethers.constants.AddressZero, this.escrow.address, ethers.utils.parseEther('1000'));

            await expect(this.escrowFactory.newWallet(this.vesting, this.accounts.manager.address))
                .to.emit(this.token, 'RoleGranted')
                .withArgs(this.roles.WHITELIST, this.escrow.address, this.escrowFactory.address)
                .to.emit(this.escrowFactory, 'NewStakingEscrow')
                .withArgs(this.escrow.address, this.vesting, this.accounts.manager.address);
        });

        describe.skip('with deposit', async function () {
            beforeEach(async function () {
                this.value = ethers.utils.parseEther('1.00');

                await expect(this.escrow.connect(this.accounts.manager).functions['deposit(uint8,uint256,uint256)'](subjectType, subject, this.value))
                    .to.emit(this.token, 'Approval')
                    .withArgs(this.escrow.address, this.staking.address, this.value)
                    .to.emit(this.token, 'Transfer')
                    .withArgs(this.escrow.address, this.staking.address, this.value)
                    .to.emit(this.token, 'Approval')
                    .withArgs(this.escrow.address, this.staking.address, 0)
                    .to.emit(this.staking, 'TransferSingle')
                    .withArgs(this.escrow.address, ethers.constants.AddressZero, this.escrow.address, active, this.value)
                    .to.emit(this.staking, 'StakeDeposited')
                    .withArgs(subjectType, subject, this.escrow.address, this.value);
                expect(await this.token.allowance(this.escrow.address, this.staking.address)).to.equal(ethers.BigNumber.from('0'));
            });

            it('multiple deposits reaching max stake do not break StakingEscrow', async function () {
                await this.scannerPools.connect(this.accounts.manager).setStakeThreshold({ max: this.value, min: '1', activated: true });
                await expect(this.escrow.connect(this.accounts.manager).functions['deposit(uint8,uint256,uint256)'](subjectType, subject, this.value))
                    .to.emit(this.token, 'Approval')
                    .withArgs(this.escrow.address, this.staking.address, this.value)
                    .to.emit(this.token, 'Transfer')
                    .withArgs(this.escrow.address, this.staking.address, ethers.BigNumber.from('0'))
                    .to.emit(this.token, 'Approval')
                    .withArgs(this.escrow.address, this.staking.address, ethers.BigNumber.from('0'))
                    .to.emit(this.staking, 'TransferSingle')
                    .withArgs(this.escrow.address, ethers.constants.AddressZero, this.escrow.address, active, ethers.BigNumber.from('0'))
                    .to.emit(this.staking, 'StakeDeposited')
                    .withArgs(subjectType, subject, this.escrow.address, ethers.BigNumber.from('0'));
                expect(await this.token.allowance(this.escrow.address, this.staking.address)).to.equal(ethers.BigNumber.from('0'));
                await expect(this.escrow.connect(this.accounts.manager).functions['deposit(uint8,uint256,uint256)'](subjectType, subject, this.value))
                    .to.emit(this.token, 'Approval')
                    .withArgs(this.escrow.address, this.staking.address, this.value)
                    .to.emit(this.token, 'Transfer')
                    .withArgs(this.escrow.address, this.staking.address, ethers.BigNumber.from('0'))
                    .to.emit(this.token, 'Approval')
                    .withArgs(this.escrow.address, this.staking.address, ethers.BigNumber.from('0'))
                    .to.emit(this.staking, 'TransferSingle')
                    .withArgs(this.escrow.address, ethers.constants.AddressZero, this.escrow.address, active, ethers.BigNumber.from('0'))
                    .to.emit(this.staking, 'StakeDeposited')
                    .withArgs(subjectType, subject, this.escrow.address, ethers.BigNumber.from('0'));
                await this.scannerPools.connect(this.accounts.manager).setStakeThreshold({ max: this.value.mul('2'), min: '1', activated: true });
                await expect(this.escrow.connect(this.accounts.manager).functions['deposit(uint8,uint256,uint256)'](subjectType, subject, this.value))
                    .to.emit(this.token, 'Approval')
                    .withArgs(this.escrow.address, this.staking.address, this.value)
                    .to.emit(this.token, 'Transfer')
                    .withArgs(this.escrow.address, this.staking.address, this.value)
                    .to.emit(this.token, 'Approval')
                    .withArgs(this.escrow.address, this.staking.address, 0)
                    .to.emit(this.staking, 'TransferSingle')
                    .withArgs(this.escrow.address, ethers.constants.AddressZero, this.escrow.address, active, this.value)
                    .to.emit(this.staking, 'StakeDeposited')
                    .withArgs(subjectType, subject, this.escrow.address, this.value);
                expect(await this.token.allowance(this.escrow.address, this.staking.address)).to.equal(ethers.BigNumber.from('0'));
                await expect(this.escrow.connect(this.accounts.manager).functions['deposit(uint8,uint256,uint256)'](subjectType, subject, this.value))
                    .to.emit(this.token, 'Approval')
                    .withArgs(this.escrow.address, this.staking.address, this.value)
                    .to.emit(this.token, 'Transfer')
                    .withArgs(this.escrow.address, this.staking.address, ethers.BigNumber.from('0'))
                    .to.emit(this.token, 'Approval')
                    .withArgs(this.escrow.address, this.staking.address, ethers.BigNumber.from('0'))
                    .to.emit(this.staking, 'TransferSingle')
                    .withArgs(this.escrow.address, ethers.constants.AddressZero, this.escrow.address, active, ethers.BigNumber.from('0'))
                    .to.emit(this.staking, 'StakeDeposited')
                    .withArgs(subjectType, subject, this.escrow.address, ethers.BigNumber.from('0'));
                expect(await this.token.allowance(this.escrow.address, this.staking.address)).to.equal(ethers.BigNumber.from('0'));
            });

            describe('with rewards', async function () {
                beforeEach(async function () {
                    this.reward = ethers.utils.parseEther('0.01');

                    await expect(this.staking.connect(this.accounts.user1).reward(subjectType, subject, this.reward))
                        .to.emit(this.staking, 'Rewarded')
                        .withArgs(subjectType, subject, this.accounts.user1.address, this.reward);
                });

                it('can claim on staking', async function () {
                    await expect(this.staking.releaseReward(subjectType, subject, this.escrow.address))
                        .to.emit(this.token, 'Transfer')
                        .withArgs(this.staking.address, this.escrow.address, this.reward)
                        .to.emit(this.staking, 'Released')
                        .withArgs(subjectType, subject, this.escrow.address, this.reward);

                    expect(await this.escrow.pendingReward()).to.be.equal(this.reward);
                });

                it('can claim on escrow', async function () {
                    await expect(this.escrow.claimReward(subjectType, subject))
                        .to.emit(this.token, 'Transfer')
                        .withArgs(this.staking.address, this.escrow.address, this.reward)
                        .to.emit(this.staking, 'Released')
                        .withArgs(subjectType, subject, this.escrow.address, this.reward);

                    expect(await this.escrow.pendingReward()).to.be.equal(this.reward);
                });

                describe('with rewards claimed', async function () {
                    beforeEach(async function () {
                        await expect(this.escrow.claimReward(subjectType, subject))
                            .to.emit(this.token, 'Transfer')
                            .withArgs(this.staking.address, this.escrow.address, this.reward)
                            .to.emit(this.staking, 'Released')
                            .withArgs(subjectType, subject, this.escrow.address, this.reward);

                        expect(await this.escrow.pendingReward()).to.be.equal(this.reward);
                    });

                    it('protected', async function () {
                        await expect(this.escrow.releaseAllReward(this.accounts.manager.address)).to.be.revertedWith(
                            `DoesNotHaveAccess("${this.accounts.admin.address}", "l2Manager")`
                        );
                    });

                    it('authorized', async function () {
                        await expect(this.escrow.connect(this.accounts.manager).release(this.token.address, this.accounts.manager.address, this.reward))
                            .to.emit(this.token, 'Transfer')
                            .withArgs(this.escrow.address, this.accounts.manager.address, this.reward);

                        expect(await this.escrow.pendingReward()).to.be.equal(0);
                    });

                    it('too much', async function () {
                        await expect(this.escrow.connect(this.accounts.manager).release(this.token.address, this.accounts.manager.address, this.reward.add(1))).to.be.reverted;
                    });

                    it('in two step', async function () {
                        await expect(this.escrow.connect(this.accounts.manager).release(this.token.address, this.accounts.manager.address, this.reward.sub(1)))
                            .to.emit(this.token, 'Transfer')
                            .withArgs(this.escrow.address, this.accounts.manager.address, this.reward.sub(1));

                        expect(await this.escrow.pendingReward()).to.be.equal(1);

                        await expect(this.escrow.connect(this.accounts.manager).release(this.token.address, this.accounts.manager.address, 1))
                            .to.emit(this.token, 'Transfer')
                            .withArgs(this.escrow.address, this.accounts.manager.address, 1);

                        expect(await this.escrow.pendingReward()).to.be.equal(0);
                    });

                    it('all', async function () {
                        await expect(this.escrow.connect(this.accounts.manager).releaseAllReward(this.accounts.manager.address))
                            .to.emit(this.token, 'Transfer')
                            .withArgs(this.escrow.address, this.accounts.manager.address, this.reward);

                        expect(await this.escrow.pendingReward()).to.be.equal(0);
                    });
                });
            });

            describe('withdrawal', function () {
                it('protected', async function () {
                    await expect(this.escrow.functions['initiateWithdrawal(uint8,uint256,uint256)'](subjectType, subject, this.value)).to.be.revertedWith(
                        'DoesNotHaveAccess("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "l2Manager")'
                    );

                    await expect(this.escrow.functions['initiateWithdrawal(uint8,uint256)'](subjectType, subject)).to.be.revertedWith(
                        'DoesNotHaveAccess("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "l2Manager")'
                    );

                    await expect(this.escrow.withdraw(subjectType, subject)).to.be.revertedWith('DoesNotHaveAccess("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "l2Manager")');
                });

                it('authorized', async function () {
                    const tx1 = await this.escrow.connect(this.accounts.manager).functions['initiateWithdrawal(uint8,uint256,uint256)'](subjectType, subject, this.value);
                    const tx2 = await this.escrow.connect(this.accounts.manager).withdraw(subjectType, subject);

                    await expect(tx1)
                        .to.emit(this.staking, 'WithdrawalInitiated')
                        .withArgs(subjectType, subject, this.escrow.address, await txTimestamp(tx1))
                        .to.emit(this.staking, 'TransferSingle')
                        .withArgs(this.escrow.address, this.escrow.address, ethers.constants.AddressZero, active, this.value)
                        .to.emit(this.staking, 'TransferSingle')
                        .withArgs(this.escrow.address, ethers.constants.AddressZero, this.escrow.address, inactive, this.value);

                    await expect(tx2)
                        .to.emit(this.token, 'Transfer')
                        .withArgs(this.staking.address, this.escrow.address, this.value)
                        .to.emit(this.staking, 'TransferSingle')
                        .withArgs(this.escrow.address, this.escrow.address, ethers.constants.AddressZero, inactive, this.value)
                        .to.emit(this.staking, 'WithdrawalExecuted')
                        .withArgs(subjectType, subject, this.escrow.address);
                });

                it('authorized - full', async function () {
                    const initialBalance = await this.token.balanceOf(this.escrow.address);
                    const tx1 = await this.escrow.connect(this.accounts.manager).functions['initiateWithdrawal(uint8,uint256)'](subjectType, subject);
                    const tx2 = await this.escrow.connect(this.accounts.manager).withdraw(subjectType, subject);
                    await expect(tx1)
                        .to.emit(this.staking, 'WithdrawalInitiated')
                        .withArgs(subjectType, subject, this.escrow.address, await txTimestamp(tx1))
                        .to.emit(this.staking, 'TransferSingle')
                        .withArgs(this.escrow.address, this.escrow.address, ethers.constants.AddressZero, active, this.value)
                        .to.emit(this.staking, 'TransferSingle')
                        .withArgs(this.escrow.address, ethers.constants.AddressZero, this.escrow.address, inactive, this.value);

                    await expect(tx2)
                        .to.emit(this.token, 'Transfer')
                        .withArgs(this.staking.address, this.escrow.address, this.value)
                        .to.emit(this.staking, 'TransferSingle')
                        .withArgs(this.escrow.address, this.escrow.address, ethers.constants.AddressZero, inactive, this.value)
                        .to.emit(this.staking, 'WithdrawalExecuted')
                        .withArgs(subjectType, subject, this.escrow.address);
                    expect(await this.token.balanceOf(this.escrow.address)).to.equal(initialBalance.add(this.value));
                });
            });
        });
    });
});
