const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');
const { prepare, deployUpgradeable, performUpgrade } = require('./fixture');

describe('Forta upgrade', function () {
    prepare();

    describe('Token update', function () {
        it('authorized', async function () {
            this.token = await performUpgrade(hre, this.token, 'FortaExtendedMock');
            expect(await this.token.version()).to.be.equal('FortaExtendedMock');
        });

        it('unauthorized', async function () {
            const ADMIN_ROLE = await this.token.ADMIN_ROLE();

            await this.token.renounceRole(ADMIN_ROLE, this.accounts.admin.address);
            await expect(performUpgrade(hre, this.token, 'FortaExtendedMock')).to.be.revertedWith(
                `AccessControl: account ${this.accounts.admin.address.toLowerCase()} is missing role ${ADMIN_ROLE}`
            );
        });
    });

    describe('Vesting update', function () {
        describe('vesting with admin', function () {
            beforeEach(async function () {
                this.vesting = await deployUpgradeable(hre, 'VestingWallet', 'uups', [this.accounts.other.address, this.accounts.admin.address, 0, 0, 0], {
                    unsafeAllow: 'delegatecall',
                });
                expect(await this.vesting.owner()).to.be.equal(this.accounts.admin.address);
            });

            it('authorized', async function () {
                this.vesting = await performUpgrade(hre, this.vesting, 'VestingWalletExtendedMock', { unsafeAllow: 'delegatecall' });
                expect(await this.vesting.version()).to.be.equal('VestingWalletExtendedMock');
            });

            it('unauthorized', async function () {
                await this.vesting.transferOwnership(this.accounts.other.address);
                await expect(performUpgrade(hre, this.vesting, 'VestingWalletExtendedMock', { unsafeAllow: 'delegatecall' })).to.be.revertedWith(
                    `Ownable: caller is not the owner`
                );
            });
        });

        describe('locked vesting', function () {
            beforeEach(async function () {
                this.vesting = await deployUpgradeable(hre, 'VestingWalletExtendedMock', 'uups', [this.accounts.other.address, ethers.constants.AddressZero, 0, 0, 0], {
                    unsafeAllow: 'delegatecall',
                });
                expect(await this.vesting.owner()).to.be.equal(ethers.constants.AddressZero);
            });

            it('unauthorized', async function () {
                await expect(performUpgrade(hre, this.vesting, 'VestingWalletExtendedMock', { unsafeAllow: 'delegatecall' })).to.be.revertedWith(
                    `Ownable: caller is not the owner`
                );
            });
        });
    });
});
