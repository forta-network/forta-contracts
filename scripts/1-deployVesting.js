const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with the account: ${deployer.address}`);
  console.log(`Account balance: ${ethers.utils.formatEther(await deployer.getBalance())} ${ethers.constants.EtherSymbol}`);

  const beneficiary   = deployer.address;
  const admin         = ethers.constants.AddressZero;
  const start         = Date.now() / 1000 | 0;
  const cliffDuration = 1 * 365 * 86400;
  const duration      = 4 * 365 * 86400;

  const VestingWallet = await ethers.getContractFactory('VestingWallet');
  const instance = await upgrades.deployProxy(VestingWallet, [ beneficiary, admin, start, cliffDuration, duration ], { kind: 'uups' });
  await instance.deployed();
  console.log(`VestingWallet address: ${instance.address}`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
