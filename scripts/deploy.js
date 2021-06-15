const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');

Array.prototype.unique = function(op = x => x) {
  return this.filter((obj, i) => this.findIndex(entry => op(obj) === op(entry)) === i);
}

function dateToTimestamp(...params) {
  return (new Date(...params)).getTime() / 1000 | 0
}





const RECEIPT = {
  admins: [ '0x9c566D5005E7e96ED964dec9cB7477F246A37A09' ],
  minters: [ '0x84b181aE72FDF63Ed5c77B9058D990761Bb3dc44' ],
  whitelisters: [ '0xE6241CfD983cA709b34DCEb3428360C982B0e02B' ],
  allocations: [
    { beneficiary: '0x60bd5176809828Bd93411BdE9854eEA2d2CEDccf', amount: '100', start: '2021-09-01T00:00:00Z', end: '2025-09-01T00:00:00Z', upgrader: '0x9c566D5005E7e96ED964dec9cB7477F246A37A09' },
    { beneficiary: '0x603851E164947391aBD62EF98bDA93e206bfBe16', amount: '100', start: '2021-09-01T00:00:00Z', end: '2025-09-01T00:00:00Z', upgrader: '0x9c566D5005E7e96ED964dec9cB7477F246A37A09' },
    { beneficiary: '0x70ad015c653e9D455Edf43128aCcDa10a094b605', amount: '100', start: '2021-09-01T00:00:00Z', end: '2025-09-01T00:00:00Z', upgrader: '0x9c566D5005E7e96ED964dec9cB7477F246A37A09' },
    { beneficiary: '0xFd5771b6adbBAEED5bc5858dE3ed38A274d8c109', amount: '100', start: '2021-09-01T00:00:00Z', end: '2025-09-01T00:00:00Z', upgrader: '0x9c566D5005E7e96ED964dec9cB7477F246A37A09' },
  ],
}





async function main() {
  const [ deployer ] = await ethers.getSigners();

  /*******************************************************************************************************************
   *                                                  Sanity check                                                   *
   *******************************************************************************************************************/
  try {
    RECEIPT.admins.every(ethers.utils.getAddress);
    RECEIPT.minters.every(ethers.utils.getAddress);
    RECEIPT.whitelisters.every(ethers.utils.getAddress);
    RECEIPT.allocations.map(({ beneficiary }) => beneficiary).every(ethers.utils.getAddress);
    RECEIPT.allocations.map(({ upgrader    }) => upgrader   ).filter(Boolean).every(ethers.utils.getAddress);
    RECEIPT.allocations.map(({ start       }) => start      ).every(dateToTimestamp);
    RECEIPT.allocations.map(({ end         }) => end        ).every(dateToTimestamp);
    RECEIPT.allocations.map(({ amount      }) => amount     ).every(ethers.BigNumber.from);
  } catch (e) {
    console.error('SANITY CHECK FAILLED');
    console.error(e);
  }

  /*******************************************************************************************************************
   *                                                  Deploy token                                                   *
   *******************************************************************************************************************/
  console.log('[1/4] Deploy token...');
  const Fortify = await ethers.getContractFactory('Fortify');
  const fortify = await upgrades.deployProxy(Fortify, [ deployer.address ], { kind: 'uups' });
  await fortify.deployed();
  console.log(`Fortify address: ${fortify.address}`);
  console.log('[1/4] done.');

  /*******************************************************************************************************************
   *                                                   Grant role                                                    *
   *******************************************************************************************************************/
  const ADMIN_ROLE = await fortify.ADMIN_ROLE()
  const MINTER_ROLE = await fortify.MINTER_ROLE()
  const WHITELISTER_ROLE = await fortify.WHITELISTER_ROLE()
  const WHITELIST_ROLE = await fortify.WHITELIST_ROLE()

  console.log('[2/4] Setup roles...');
  await Promise.all([].concat(
    fortify.grantRole(MINTER_ROLE, deployer.address),
    fortify.grantRole(WHITELISTER_ROLE, deployer.address),
    // set admins
    RECEIPT.admins.map(address => fortify.grantRole(ADMIN_ROLE, address)),
    // set minters
    RECEIPT.minters.map(address => fortify.grantRole(MINTER_ROLE, address)),
    // set whitelisters
    RECEIPT.whitelisters.map(address => fortify.grantRole(WHITELISTER_ROLE, address)),
    // whitelist all beneficiary
    RECEIPT.allocations.map(({ beneficiary }) => beneficiary).unique().map(address => fortify.grantRole(WHITELIST_ROLE, address)),
  )).then(txs => Promise.all(txs.map(({ wait }) => wait())));
  console.log('[2/4] done.');

  /*******************************************************************************************************************
   *                                                   Grant role                                                    *
   *******************************************************************************************************************/
  const VestingWallet = await ethers.getContractFactory('VestingWallet');

  console.log('[3/4] Mint vested allocations...');
  await Promise.all(RECEIPT.allocations.map(async allocation => {
    const beneficiary = allocation.beneficiary;
    const admin       = allocation.upgrader || ethers.constants.AddressZero;
    const start       = dateToTimestamp(allocation.start);
    const duration    = dateToTimestamp(allocation.end) - start;

    // create wallet
    const vesting = await upgrades.deployProxy(VestingWallet, [ beneficiary, admin, start, duration ], { kind: 'uups' });
    await vesting.deployed();
    // whitelist wallet
    await fortify.grantRole(WHITELIST_ROLE, vesting.address);
    // mint allocation
    await fortify.mint(vesting.address, allocation.amount);

    console.log(`New vesting wallet ${vesting.address} (${ethers.utils.formatEther(allocation.amount)} to ${beneficiary})`);

    Object.assign(allocation, { vesting });
  }));
  console.log('[3/4] done.');

  /*******************************************************************************************************************
   *                                                     Cleanup                                                     *
   *******************************************************************************************************************/
  console.log('[4/4] Cleanup...');
  await Promise.all([
    fortify.renounceRole(ADMIN_ROLE, deployer.address),
    fortify.renounceRole(MINTER_ROLE, deployer.address),
    fortify.renounceRole(WHITELISTER_ROLE, deployer.address),
  ]).then(txs => Promise.all(txs.map(({ wait }) => wait())));
  console.log('[4/4] done.');


  /*******************************************************************************************************************
   *                                             Post deployment checks                                              *
   *******************************************************************************************************************/
  expect(await fortify.hasRole(ADMIN_ROLE, deployer.address)).to.be.equal(false);
  expect(await fortify.hasRole(MINTER_ROLE, deployer.address)).to.be.equal(false);
  expect(await fortify.hasRole(WHITELISTER_ROLE, deployer.address)).to.be.equal(false);
  for (const address of RECEIPT.admins) {
    expect(await fortify.hasRole(ADMIN_ROLE, address)).to.be.equal(true);
  }
  for (const address of RECEIPT.minters) {
    expect(await fortify.hasRole(MINTER_ROLE, address)).to.be.equal(true);
  }
  for (const address of RECEIPT.whitelisters) {
    expect(await fortify.hasRole(WHITELISTER_ROLE, address)).to.be.equal(true);
  }
  for (const address of RECEIPT.allocations.map(({ beneficiary }) => beneficiary)) {
    expect(await fortify.hasRole(WHITELIST_ROLE, address)).to.be.equal(true);
  }
  for (const allocation of RECEIPT.allocations) {
    const beneficiary = allocation.beneficiary;
    const admin       = allocation.upgrader || ethers.constants.AddressZero;
    const start       = dateToTimestamp(allocation.start);
    const duration    = dateToTimestamp(allocation.end) - start;

    expect(await fortify.balanceOf(allocation.vesting.address)).to.be.equal(allocation.amount);
    expect(await allocation.vesting.beneficiary()).to.be.equal(beneficiary);
    expect(await allocation.vesting.owner()).to.be.equal(admin);
    expect(await allocation.vesting.start()).to.be.equal(start);
    expect(await allocation.vesting.duration()).to.be.equal(duration);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
