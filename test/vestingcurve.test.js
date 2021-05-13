const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');
const { deploy } = require('./fixture');

describe('Fortify', function () {
  before(async function () {
    this.accounts    = await ethers.getSigners();
    this.admin       = this.accounts.shift();
    this.beneficiary = this.accounts.shift();
    this.start       = Date.now() / 1000 | 0;
    this.duration    = 30 * 86400; // 30 days
    this.deadline    =  7 * 86400; // 7 days
    this.curvature   = 2;
    this.vesting     = await deploy('CurveCliffVestingPreset', this.beneficiary.address, this.start, this.duration, this.curvature, this.start + this.deadline);
    this.token       = await deploy('Fortify');
    await this.token.initialize(this.admin.address);
    await this.token.connect(this.admin).grantRole(await this.token.MINTER_ROLE(),      this.admin.address);
    await this.token.connect(this.admin).grantRole(await this.token.WHITELISTER_ROLE(), this.admin.address);
    await this.token.connect(this.admin).grantRole(await this.token.WHITELIST_ROLE(),   this.vesting.address);
    await this.token.connect(this.admin).mint(this.vesting.address, ethers.utils.parseEther('100'));
  });

  it('check deployment', async function () {
    const results = await Promise.all(Array(50)
      .fill()
      .map((_, i) => this.start + i * 86400)
      .map(timestamp => this.vesting.vestedAmount(this.token.address, timestamp).then(x => ({ timestamp, vested: ethers.utils.formatEther(x) })))
    )

    console.log(`timestamp\tvested`);
    for (const { timestamp, vested } of results) {
      console.log(`${timestamp}\t${vested.replace('.', ',')}`);
    }
  });
});
