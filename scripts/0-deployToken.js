const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with the account: ${deployer.address}`);
  console.log(`Account balance: ${ethers.utils.formatEther(await deployer.getBalance())} ${ethers.constants.EtherSymbol}`);

  const Fortify = await ethers.getContractFactory('Fortify');
  const instance = await upgrades.deployProxy(Fortify, [deployer.address], { kind: 'uups' });
  await instance.deployed();
  console.log(`Fortify address: ${instance.address}`);

  // instance.grantRole(await instance.)
  // console.log(await instance.UPGRADER_ROLE())
  // console.log(await instance.MINTER_ROLE())
  // console.log(await instance.WHITELISTER_ROLE())
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
