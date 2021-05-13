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
    // .then(values =>
    //   values.reduce((acc, { timestamp, vested}) => ({ ...acc, [timestamp]: vested }), {})
    // )

    console.log(`timestamp\tvested`);
    for (const { timestamp, vested } of results) {
      console.log(`${timestamp}\t${vested.replace('.', ',')}`);
    }
  });

  //
  // it('create vesting contract', async function () {
  //   const start         = Date.now() / 1000 | 0;
  //   const cliffDuration = 1 * 365 * 86400; // 1 year
  //   const duration      = 4 * 365 * 86400; // 4 year
  //   // tx
  //   const { wait      } = await this.factory.create(this.accounts.other.address, this.accounts.upgrader.address, start, cliffDuration, duration);
  //   // receipt
  //   const { events    } = await wait();
  //   const { instance  } = events.find(({ event }) => event == "NewVesting").args;
  //   const vesting       = await attach('VestingWallet', instance);
  //
  //   expect(await vesting.beneficiary()).to.be.equal(this.accounts.other.address);
  //   expect(await vesting.owner()).to.be.equal(this.accounts.upgrader.address);
  //   expect(await vesting.start()).to.be.equal(start);
  //   expect(await vesting.duration()).to.be.equal(duration);
  //   expect(await vesting.cliff()).to.be.equal(start + cliffDuration);
  // });
  //
  // describe('delegate vote', function () {
  //   beforeEach(async function () {
  //     const start         = Date.now() / 1000 | 0;
  //     const cliffDuration = 1 * 365 * 86400; // 1 year
  //     const duration      = 4 * 365 * 86400; // 4 year
  //     const { wait      } = await this.factory.create(this.accounts.other.address, this.accounts.upgrader.address, start, cliffDuration, duration);
  //     const { events    } = await wait();
  //     const { instance  } = events.find(({ event }) => event == "NewVesting").args;
  //     this.vesting        = await attach('VestingWallet', instance);
  //
  //     await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.vesting.address);
  //     await this.token.connect(this.accounts.minter).mint(this.vesting.address, 1);
  //   });
  //
  //   it('wrong caller', async function () {
  //     expect(await this.token.delegates(this.vesting.address)).to.be.equal(ethers.constants.AddressZero);
  //
  //     await expect(this.vesting.execute(
  //       this.token.address,
  //       0,
  //       this.token.interface.encodeFunctionData('delegate', [ this.accounts.other.address ]),
  //     ))
  //     .to.be.revertedWith(`VestingWallet: unauthorized caller`);
  //
  //     expect(await this.token.delegates(this.vesting.address)).to.be.equal(ethers.constants.AddressZero);
  //   });
  //
  //   it('unauthorized call', async function () {
  //     expect(await this.token.delegates(this.vesting.address)).to.be.equal(ethers.constants.AddressZero);
  //
  //     await expect(this.vesting.connect(this.accounts.other).execute(
  //       this.token.address,
  //       0,
  //       this.token.interface.encodeFunctionData('delegate', [ this.accounts.other.address ]),
  //     ))
  //     .to.be.revertedWith(`VestingWallet: unauthorized call`);
  //
  //     expect(await this.token.delegates(this.vesting.address)).to.be.equal(ethers.constants.AddressZero);
  //   });
  //
  //   it('authorized call', async function () {
  //     const selector = this.token.interface.encodeFunctionData('delegate', [ this.accounts.other.address ]).substr(0, 10);
  //     await this.accesslist.setAccess(this.token.address, selector, true);
  //
  //     expect(await this.token.delegates(this.vesting.address)).to.be.equal(ethers.constants.AddressZero);
  //
  //     await expect(this.vesting.connect(this.accounts.other).execute(
  //       this.token.address,
  //       0,
  //       this.token.interface.encodeFunctionData('delegate', [ this.accounts.other.address ]),
  //     ))
  //     .to.emit(this.token, 'DelegateChanged')
  //     .withArgs(this.vesting.address, ethers.constants.AddressZero, this.accounts.other.address)
  //     .to.emit(this.token, 'DelegateVotesChanged')
  //     .withArgs(this.accounts.other.address, 0, 1);
  //
  //     expect(await this.token.delegates(this.vesting.address)).to.be.equal(this.accounts.other.address);
  //   });
  // });
});
