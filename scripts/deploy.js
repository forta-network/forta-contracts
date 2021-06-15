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
  const Fortify = await ethers.getContractFactory('Fortify');
  const fortify = await upgrades.deployProxy(Fortify, [ deployer.address ], { kind: 'uups' });
  await fortify.deployed();
  console.log(`Fortify address: ${fortify.address}`);

  /*******************************************************************************************************************
   *                                                   Grant role                                                    *
   *******************************************************************************************************************/
  const ADMIN_ROLE = await fortify.ADMIN_ROLE()
  const MINTER_ROLE = await fortify.MINTER_ROLE()
  const WHITELISTER_ROLE = await fortify.WHITELISTER_ROLE()
  const WHITELIST_ROLE = await fortify.WHITELIST_ROLE()

  await Promise.all([].concat(
    // give the deployer right to mint
    fortify.grantRole(MINTER_ROLE, deployer.address),
    // give the deployer right to whitelist
    fortify.grantRole(WHITELISTER_ROLE, deployer.address),
    // set admins
    RECEIPT.admins.map(address => fortify.grantRole(ADMIN_ROLE, address)),
    // set minters
    RECEIPT.minters.map(address => fortify.grantRole(MINTER_ROLE, address)),
    // set whitelisters
    RECEIPT.whitelisters.map(address => fortify.grantRole(WHITELISTER_ROLE, address)),
    // whitelist all beneficiary
    RECEIPT.allocations.map(({ beneficiary }) => beneficiary).unique().map(address => fortify.grantRole(WHITELIST_ROLE, address)),
  ));

  /*******************************************************************************************************************
   *                                                   Grant role                                                    *
   *******************************************************************************************************************/
  const VestingWallet = await ethers.getContractFactory('VestingWallet');

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

    console.log(`New vesting wallet ${vesting.address} (${ethers.utils.formatEther(allocation.amount)} to ${beneficiary})`)
  }));

  /*******************************************************************************************************************
   *                                                     Cleanup                                                     *
   *******************************************************************************************************************/
  await Promise.all([
    fortify.renounceRole(ADMIN_ROLE, deployer.address),
    fortify.renounceRole(MINTER_ROLE, deployer.address),
    fortify.renounceRole(WHITELISTER_ROLE, deployer.address),
  ]);

  console.log('done.')
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
