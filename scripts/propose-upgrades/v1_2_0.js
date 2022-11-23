const hre = require('hardhat');
const { ethers } = hre;
const DEBUG = require('debug')('forta');
const deployEnv = require('../loadEnv');
const { proposeUpgrade } = require('../utils');

async function main() {
    const { provider, deployer, deployment, network, CACHE } = await deployEnv.loadEnv();
    const { name, chainId } = network;

    const MULTISIG_ADDRESS = process.env[`${hre.network.name.toUpperCase()}_MULTISIG`];

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`ENS:      ${provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG('----------------------------------------------------');

    if (name !== 'hardhat' && deployer.address === '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266') {
        throw new Error('using hardhat key for other network');
    }

    console.log('upgrading FortaStaking...');
    console.log(
        await proposeUpgrade(
            'FortaStaking',
            {
                unsafeAllow: ['delegatecall'],
                multisig: MULTISIG_ADDRESS,
                constructorArgs: [deployment.forwarder.address],
            },
            CACHE,
            'staking'
        )
    );
    console.log('FortaStaking proposed!');

    console.log('upgrading StakeSubjectGateway...');
    console.log(
        await proposeUpgrade(
            'StakeSubjectGateway',
            {
                unsafeAllow: ['delegatecall'],
                multisig: MULTISIG_ADDRESS,
                constructorArgs: [deployment.forwarder.address],
            },
            CACHE,
            'staking-parameters'
        )
    );
    console.log('StakeSubjectGateway proposed!');

    console.log('upgrading Dispatch...');
    console.log(
        await proposeUpgrade(
            'Dispatch',
            {
                unsafeAllow: ['delegatecall'],
                multisig: MULTISIG_ADDRESS,
                constructorArgs: [deployment.forwarder.address],
            },
            CACHE,
            'dispatch'
        )
    );
    console.log('Dispatch proposed!');

    console.log('upgrading ScannerRegistry...');
    console.log(
        await proposeUpgrade(
            'ScannerRegistry',
            {
                unsafeAllow: ['delegatecall'],
                multisig: MULTISIG_ADDRESS,
                constructorArgs: [deployment.forwarder.address],
            },
            CACHE,
            'scanners'
        )
    );
    console.log('ScannerRegistry proposed!');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
