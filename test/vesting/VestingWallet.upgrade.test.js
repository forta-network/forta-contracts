const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');
const { prepare, deployUpgradeable, performUpgrade, deploy, attach } = require('../fixture');
const utils = require('../../scripts/utils');

const allocation = {
    start: utils.dateToTimestamp('2021-09-01T00:00:00Z'),
    cliff: utils.durationToSeconds('1 year'),
    duration: utils.durationToSeconds('4 years'),
};

describe('VestingWallet ', function () {
    prepare();

    describe('Vesting update', function () {
        describe('vesting with admin', function () {
            beforeEach(async function () {
                allocation.beneficiary = this.accounts.other.address;
                allocation.owner = this.accounts.admin.address;

                this.vesting = await deployUpgradeable(
                    hre,
                    'VestingWallet',
                    'uups',
                    [this.accounts.other.address, this.accounts.admin.address, allocation.start, allocation.cliff, allocation.duration],
                    { unsafeAllow: 'delegatecall' }
                );
                await Promise.all([this.vesting.start(), this.vesting.cliff(), this.vesting.duration(), this.vesting.beneficiary(), this.vesting.owner()]).then(
                    ([start, cliff, duration, beneficiary, owner]) => {
                        expect(start).to.be.equal(allocation.start);
                        expect(cliff).to.be.equal(allocation.cliff);
                        expect(duration).to.be.equal(allocation.duration);
                        expect(beneficiary).to.be.equal(allocation.beneficiary);
                        expect(owner).to.be.equal(allocation.owner);
                    }
                );
            });

            it('authorized v0 -> v2', async function () {
                this.rootchainmanager = await deploy(hre, 'RootChainManagerMock');
                this.predicate = await this.rootchainmanager.predicate().then((address) => attach(hre, 'PredicatMock', address));
                this.l2escrowfactory = ethers.Wallet.createRandom();
                this.l2escrowtemplate = ethers.Wallet.createRandom();

                this.vesting = await performUpgrade(hre, this.vesting, 'VestingWalletV2', {
                    constructorArgs: [this.rootchainmanager.address, this.token.address, this.l2escrowfactory.address, this.l2escrowtemplate.address],
                    unsafeAllow: 'delegatecall',
                });

                await Promise.all([
                    this.vesting.start(),
                    this.vesting.cliff(),
                    this.vesting.duration(),
                    this.vesting.beneficiary(),
                    this.vesting.owner(),
                    this.vesting.rootChainManager(),
                    this.vesting.l1Token(),
                    this.vesting.l2EscrowFactory(),
                    this.vesting.l2EscrowTemplate(),
                    this.vesting.historicalBalanceMin(),
                ]).then(([start, cliff, duration, beneficiary, owner, rootChainManager, l1Token, l2EscrowFactory, l2EscrowTemplate, historicalBalanceMin]) => {
                    expect(start).to.be.equal(allocation.start);
                    expect(cliff).to.be.equal(allocation.cliff);
                    expect(duration).to.be.equal(allocation.duration);
                    expect(beneficiary).to.be.equal(allocation.beneficiary);
                    expect(owner).to.be.equal(allocation.owner);
                    expect(rootChainManager).to.be.equal(this.rootchainmanager.address);
                    expect(l1Token).to.be.equal(this.token.address);
                    expect(l2EscrowFactory).to.be.equal(this.l2escrowfactory.address);
                    expect(l2EscrowTemplate).to.be.equal(this.l2escrowtemplate.address);
                    expect(historicalBalanceMin).to.be.equal('0');
                });
            });

            it('unauthorized', async function () {
                await this.vesting.transferOwnership(this.accounts.other.address);
                await expect(performUpgrade(hre, this.vesting, 'VestingWalletExtendedMock', { unsafeAllow: 'delegatecall' })).to.be.revertedWith(
                    `Ownable: caller is not the owner`
                );
            });
        });
    });
});
