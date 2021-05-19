const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');
const { prepare, deployUpgradeable } = require('./fixture');


const start    = Date.now() / 1000 | 0;
const duration = 4 * 365 * 86400; // 4 years

describe('Fortify', function () {
  prepare();

  beforeEach(async function () {
    this.vesting = await deployUpgradeable('VestingWallet', 'uups', this.accounts.other.address, this.accounts.upgrader.address, start, duration);
    await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.vesting.address);
    await this.token.connect(this.accounts.minter).mint(this.vesting.address, 1);
  });

  it('create vesting contract', async function () {
    expect(await this.vesting.beneficiary()).to.be.equal(this.accounts.other.address);
    expect(await this.vesting.owner()).to.be.equal(this.accounts.upgrader.address);
    expect(await this.vesting.start()).to.be.equal(start);
    expect(await this.vesting.duration()).to.be.equal(duration);
  });

  describe('vesting schedule', function () {
    // TODO
  });

  describe('delegate vote', function () {
    it('wrong caller', async function () {
      expect(await this.token.delegates(this.vesting.address)).to.be.equal(ethers.constants.AddressZero);

      await expect(this.vesting.delegate(this.token.address, this.accounts.other.address))
        .to.be.revertedWith(`TokenVesting: access restricted to beneficiary`);

      expect(await this.token.delegates(this.vesting.address)).to.be.equal(ethers.constants.AddressZero);
    });

    it('authorized call', async function () {
      expect(await this.token.delegates(this.vesting.address)).to.be.equal(ethers.constants.AddressZero);

      await expect(this.vesting.connect(this.accounts.other).delegate(this.token.address, this.accounts.other.address))
        .to.emit(this.token, 'DelegateChanged')
        .withArgs(this.vesting.address, ethers.constants.AddressZero, this.accounts.other.address)
        .to.emit(this.token, 'DelegateVotesChanged')
        .withArgs(this.accounts.other.address, 0, 1);

      expect(await this.token.delegates(this.vesting.address)).to.be.equal(this.accounts.other.address);
    });
  });
});
