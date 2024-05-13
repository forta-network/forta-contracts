const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');
const { prepare, deployUpgradeable, performUpgrade } = require('../fixture');
const utils = require('../../scripts/utils');

const allocation = {
    start: utils.dateToTimestamp('2021-09-01T00:00:00Z'),
    cliff: utils.durationToSeconds('1 year'),
    duration: utils.durationToSeconds('4 years'),
};

describe('VestingWallet ', function () {
    prepare();

    describe('Vesting recovery', function () {
        describe('vesting with admin', function () {
            beforeEach(async function () {
                allocation.beneficiary = this.accounts.user1.address;
                allocation.newBeneficiary = this.accounts.user2.address;
                allocation.owner = this.accounts.admin.address;

                this.vesting = await deployUpgradeable(
                    hre,
                    'VestingWallet',
                    'uups',
                    [allocation.beneficiary, allocation.owner, allocation.start, allocation.cliff, allocation.duration],
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

            it('perform recovery (full upgrade)', async function () {
                this.vesting = await performUpgrade(hre, this.vesting, 'VestingWalletRecovery', {
                    unsafeAllow: 'delegatecall',
                });

                // restricted
                await expect(this.vesting.connect(this.accounts.other).updateBeneficiary(this.accounts.other.address))
                    .to.be.revertedWith(`Ownable: caller is not the owner`);

                // authorized
                await expect(this.vesting.connect(this.accounts.admin).updateBeneficiary(allocation.newBeneficiary))
                    .to.emit(this.vesting, 'BeneficiaryUpdate').withArgs(allocation.newBeneficiary);
            });

            it('perform recovery (transitory upgrade)', async function () {
                const implementation = await hre.upgrades.erc1967.getImplementationAddress(this.vesting.address);

                await performUpgrade(hre, this.vesting, 'VestingWalletRecoveryLight', {
                    call: { fn: 'changeOwnerAndUpgrade', args: [allocation.newBeneficiary, implementation] },
                    unsafeAllow: 'delegatecall'
                });
            });

            afterEach(async function () {
                await Promise.all([this.vesting.start(), this.vesting.cliff(), this.vesting.duration(), this.vesting.beneficiary(), this.vesting.owner()]).then(
                    ([start, cliff, duration, beneficiary, owner]) => {
                        expect(start).to.be.equal(allocation.start);
                        expect(cliff).to.be.equal(allocation.cliff);
                        expect(duration).to.be.equal(allocation.duration);
                        expect(beneficiary).to.be.equal(allocation.newBeneficiary);
                        expect(owner).to.be.equal(allocation.owner);
                    }
                );
            });
        });
    });
});
