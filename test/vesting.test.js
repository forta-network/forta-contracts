const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');
const { prepare, deployUpgradeable } = require('./fixture');

describe('Fortify', function () {
  prepare();

  it('create vesting contract', async function () {
    const start         = Date.now() / 1000 | 0;
    const cliffDuration = 1 * 365 * 86400; // 1 year
    const duration      = 4 * 365 * 86400; // 4 year

    const vesting = await deployUpgradeable('VestingWallet', 'uups', this.accounts.other.address, this.accounts.upgrader.address, start, cliffDuration, duration);

    expect(await vesting.beneficiary()).to.be.equal(this.accounts.other.address);
    expect(await vesting.owner()).to.be.equal(this.accounts.upgrader.address);
    expect(await vesting.start()).to.be.equal(start);
    expect(await vesting.duration()).to.be.equal(duration);
    expect(await vesting.curvature()).to.be.equal(1);
    expect(await vesting.releaseDate()).to.be.equal(start + cliffDuration);
  });

  describe('vesting schedule', function () {
    // TODO
  });

  describe('delegate vote', function () {
    beforeEach(async function () {
      const start         = Date.now() / 1000 | 0;
      const cliffDuration = 1 * 365 * 86400; // 1 year
      const duration      = 4 * 365 * 86400; // 4 year

      this.vesting = await deployUpgradeable('VestingWallet', 'uups', this.accounts.other.address, this.accounts.upgrader.address, start, cliffDuration, duration);

      await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.vesting.address);
      await this.token.connect(this.accounts.minter).mint(this.vesting.address, 1);
    });

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
