const { ethers, upgrades } = require("hardhat");
const { expect } = require('chai');

function dateToTimestamp(...params) {
  return (new Date(...params)).getTime() / 1000 | 0
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with the account: ${deployer.address}`);
  console.log(`Account balance: ${ethers.utils.formatEther(await deployer.getBalance())} ${ethers.constants.EtherSymbol}`);

  const beneficiary   = ethers.utils.getAddress(ethers.utils.hexlify(ethers.utils.randomBytes(20)));
  const admin         = deployer.address;
  const start         = dateToTimestamp('2021-06-01T00:00:00Z')
  const duration      = dateToTimestamp('2025-06-01T00:00:00Z') - start

  const VestingWallet = await ethers.getContractFactory('VestingWallet');
  const instance = await upgrades.deployProxy(VestingWallet, [ beneficiary, admin, start, duration ], { kind: 'uups' });
  await instance.deployed();
  console.log(`VestingWallet address: ${instance.address}`);

  // check proper initialization
  expect(await instance.beneficiary()).to.be.equal(beneficiary);
  expect(await instance.owner()).to.be.equal(admin);
  expect(await instance.start()).to.be.equal(start);
  expect(await instance.duration()).to.be.equal(duration);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
