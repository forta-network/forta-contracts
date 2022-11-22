const hre = require('hardhat');
const { ethers, defender, upgrades } = hre;
const DEBUG = require('debug')('forta');
const deployEnv = require('../loadEnv');

async function main() {
    const { provider, deployer, deployment, network, contracts } = await deployEnv.loadEnv();
    const { name, chainId } = network;

    const MULTISIG_ADDRESS = process.env[`${hre.network.name.toUpperCase()}_MULTISIG`];
    console.log(MULTISIG_ADDRESS);
    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`ENS:      ${provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG('----------------------------------------------------');

    if (name !== 'hardhat' && deployer.address === '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266') {
        throw new Error('using hardhat key for other network');
    }

    const proposals = [];
    /*
    console.log('upgrading FortaStaking...');
    proposals.push(
        await upgrades.prepareUpgrade(contracts.staking.address, await ethers.getContractFactory('FortaStaking', deployer), {
            unsafeAllow: ['delegatecall'],
            multisig: MULTISIG_ADDRESS,
            constructorArgs: [deployment.forwarder.address],
            unsafeSkipStorageCheck: true,
        })
    );
    console.log(proposals);
    console.log('FortaStaking proposed!');
*/
/*
    console.log('upgrading StakeSubjectGateway...');
    proposals.push(
        await defender.proposeUpgrade(contracts.subjectGateway.address, await ethers.getContractFactory('StakeSubjectGateway', deployer), {
            unsafeAllow: ['delegatecall'],
            multisig: MULTISIG_ADDRESS,
            constructorArgs: [contracts.forwarder.address],
            unsafeSkipStorageCheck: true,
        })
    );
    console.log('StakeSubjectGateway proposed!');

    console.log('upgrading Dispatch...');

    proposals.push(
        await defender.proposeUpgrade(contracts.dispatch.address, await ethers.getContractFactory('Dispatch', deployer), {
            unsafeAllow: ['delegatecall'],
            multisig: MULTISIG_ADDRESS,
            constructorArgs: [contracts.forwarder.address],
            unsafeSkipStorageCheck: true,
        })
    );
    console.log('Dispatch proposed!');
*/
    console.log('upgrading ScannerRegistry...');

    proposals.push(
        await defender.proposeUpgrade(contracts.scanners.address, await ethers.getContractFactory('ScannerRegistry', deployer), {
            unsafeAllow: ['delegatecall'],
            multisig: MULTISIG_ADDRESS,
            constructorArgs: [contracts.forwarder.address],
            unsafeSkipStorageCheck: true,
        })
    );
    console.log('ScannerRegistry proposed!');

    console.log(proposals.map((x) => x.url));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
