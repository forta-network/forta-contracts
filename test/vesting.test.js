const { ethers } = require('hardhat');
const { expect } = require('chai');
const { prepare, deployUpgradeable } = require('./fixture');

const min = (...args) => args.slice(1).reduce((x,y) => x.lt(y) ? x : y, args[0]);
const max = (...args) => args.slice(1).reduce((x,y) => x.gt(y) ? x : y, args[0]);

const start    = Date.now() / 1000 | 0 + 3600; // in 1 hour
const cliff    = 1 * 365 * 86400; // 1 years
const end      = start + 4 * 365 * 86400; // 4 years
const amount   = ethers.utils.parseEther('100');

const schedule = Array(256).fill()
  .map((_,i) => ethers.BigNumber.from(i).mul(end - start).div(224).add(start))
  .map(timestamp => ({
      timestamp,
      vested: timestamp - start < cliff
        ? ethers.constants.Zero
        : min(amount.mul(timestamp.sub(start)).div(end - start), amount),
  }));

describe('VestingWallet', function () {
  prepare();

  beforeEach(async function () {
    this.vesting = await deployUpgradeable(
      'VestingWallet',
      'uups',
      this.accounts.other.address,
      this.accounts.admin.address,
      start,
      cliff,
      end - start, // duration
    );
    await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.vesting.address);
    await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.other.address);
    await this.token.connect(this.accounts.minter).mint(this.vesting.address, amount);
  });

  it('rejects zero address for beneficiary', async function () {
    await expect(deployUpgradeable(
      'VestingWallet',
      'uups',
      ethers.constants.AddressZero,
      this.accounts.admin.address,
      start,
      cliff,
      end - start, // duration
    )).to.be.revertedWith('VestingWallet: beneficiary is zero address');
  });

  it('create vesting contract', async function () {
    expect(await this.vesting.beneficiary()).to.be.equal(this.accounts.other.address);
    expect(await this.vesting.owner()).to.be.equal(this.accounts.admin.address);
    expect(await this.vesting.start()).to.be.equal(start);
    expect(await this.vesting.cliff()).to.be.equal(cliff);
    expect(await this.vesting.duration()).to.be.equal(end - start);
  });

  describe('vesting schedule', function () {
    it('check vesting schedule', async function () {
      for (const { timestamp, vested } of schedule) {
        expect(await this.vesting.vestedAmount(this.token.address, timestamp)).to.be.equal(vested);
      }
    });

    it('execute vesting schedule', async function () {
      //early
      await expect(this.vesting.release(this.token.address))
        .to.emit(this.vesting, 'TokensReleased')
        .withArgs(this.token.address, ethers.constants.Zero)
        .to.emit(this.token, 'Transfer')
        .withArgs(this.vesting.address, this.accounts.other.address, ethers.constants.Zero);

      // on schedule
      let released = ethers.constants.Zero;
      for (const { timestamp, vested } of schedule) {
        await ethers.provider.send('evm_setNextBlockTimestamp', [ timestamp.toNumber() ]);

        await expect(this.vesting.release(this.token.address))
          .to.emit(this.vesting, 'TokensReleased')
          .withArgs(this.token.address, vested.sub(released))
          .to.emit(this.token, 'Transfer')
          .withArgs(this.vesting.address, this.accounts.other.address, vested.sub(released));

        released = vested;

        expect(await this.token.balanceOf(this.vesting.address)).to.be.equal(amount.sub(vested));
        expect(await this.token.balanceOf(this.accounts.other.address)).to.be.equal(vested);
      }
    });
  });

  describe('delegate vote', function () {
    it('wrong caller', async function () {
      expect(await this.token.delegates(this.vesting.address)).to.be.equal(ethers.constants.AddressZero);

      await expect(this.vesting.delegate(this.token.address, this.accounts.other.address))
        .to.be.revertedWith(`VestingWallet: access restricted to beneficiary`);

      expect(await this.token.delegates(this.vesting.address)).to.be.equal(ethers.constants.AddressZero);
    });

    it('authorized call', async function () {
      expect(await this.token.delegates(this.vesting.address)).to.be.equal(ethers.constants.AddressZero);

      await expect(this.vesting.connect(this.accounts.other).delegate(this.token.address, this.accounts.other.address))
        .to.emit(this.token, 'DelegateChanged')
        .withArgs(this.vesting.address, ethers.constants.AddressZero, this.accounts.other.address)
        .to.emit(this.token, 'DelegateVotesChanged')
        .withArgs(this.accounts.other.address, 0, amount);

      expect(await this.token.delegates(this.vesting.address)).to.be.equal(this.accounts.other.address);
    });
  });
});
