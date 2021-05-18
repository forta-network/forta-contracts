const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');
const { deploy } = require('../fixture');

describe('Fortify', function () {
  before(async function () {
    const { timestamp } = await ethers.provider.getBlock('latest');
    this.accounts       = await ethers.getSigners();
    this.admin          = this.accounts.shift();
    this.beneficiary    = this.accounts.shift();
    this.start          = timestamp + 3600; // in 1 h
    this.duration       = 30 * 86400; // 30 days
    this.stepduration   =  1 * 86400; // 1 days
    this.deadline       =  7 * 86400; // 7 days
    this.curvature      = 2;
    this.vesting        = await deploy('SteppedCurveCliffVestingPreset', this.beneficiary.address, this.start, this.duration, this.stepduration, this.curvature, this.start + this.deadline);
    this.token          = await deploy('Fortify');
    await this.token.initialize(this.admin.address);
    await this.token.connect(this.admin).grantRole(await this.token.MINTER_ROLE(),      this.admin.address);
    await this.token.connect(this.admin).grantRole(await this.token.WHITELISTER_ROLE(), this.admin.address);
    await this.token.connect(this.admin).grantRole(await this.token.WHITELIST_ROLE(),   this.admin.address); // needed for revoke
    await this.token.connect(this.admin).grantRole(await this.token.WHITELIST_ROLE(),   this.vesting.address); // needed for vesting
    await this.token.connect(this.admin).grantRole(await this.token.WHITELIST_ROLE(),   this.beneficiary.address); // needed for release
    await this.token.connect(this.admin).mint(this.vesting.address, ethers.utils.parseEther('100'));
    this.epsilon   = 14400 // every 4h
    this.timesteps = Array(this.duration * 1.2 / this.epsilon).fill().map((_, i) => this.start + i * this.epsilon)
  });

  it('check planning', async function () {
    this.planning = await Promise.all(
      this.timesteps.map(timestamp => this.vesting.vestedAmount(this.token.address, timestamp).then(vested => ({ timestamp, vested })))
    )
    console.log(`timestamp\tvested`);
    for (const { timestamp, vested } of this.planning) {
      console.log(`${ethers.utils.formatEther(vested).replace('.', ',')}`);
    }
  });

  it(`run`, async function () {
    for (const i in this.timesteps) {
      const timestamp = this.timesteps[i]
      await ethers.provider.send('evm_setNextBlockTimestamp', [ timestamp ]);
      const released  = await this.vesting.released(this.token.address);
      const vested    = await this.vesting.vestedAmount(this.token.address, timestamp);
      const supply    = await this.token.totalSupply();

      // nothing to release
      if (released.eq(vested)) continue;

      if (i == 25) {
        expect(await this.token.balanceOf(this.admin.address)).to.be.equal(0);

        await expect(this.vesting.connect(this.admin).revoke(this.token.address))
          .emit(this.token, 'Transfer')
          // .withArgs(this.vesting.address, this.admin.address, supply.sub(released))
          .emit(this.vesting, 'TokenVestingRevoked')
          .withArgs(this.token.address);

        expect(await this.token.balanceOf(this.admin.address)).to.be.equal(supply.sub(vested));
      }

      await expect(this.vesting.release(this.token.address))
        .emit(this.token, 'Transfer')
        // .withArgs(this.vesting.address, this.beneficiary.address, vested.sub(released))
        .emit(this.vesting, 'TokensReleased')
        .withArgs(this.token.address, vested.sub(released));

      // console.log(`${ethers.utils.formatEther(vested.sub(released))} tokens released`);
    }
  });
});
