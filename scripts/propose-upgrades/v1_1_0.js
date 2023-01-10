const hre = require('hardhat');
const { ethers, defender, upgrades } = hre;
const DEBUG = require('debug')('forta');
const utils = require('./utils');

async function main() {
    const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `${chainId === 5 ? './_old/' : ''}.cache-${chainId}${chainId === 5 ? '-with-components' : ''}` });

    if (!provider.network.ensAddress) {
        provider.network.ensAddress = await CACHE.get('ens-registry');
    }
    const MULTISIG_ADDRESS = process.env[`${hre.network.name.toUpperCase()}_MULTISIG`];
    console.log(MULTISIG_ADDRESS);
    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`ENS:      ${provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG('----------------------------------------------------');

    if (name !== 'hardhat' && deployer.address === '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266') {
        throw new Error('using hardhat key for other network');
    }

    const contracts = {
        forwarder: await utils.attach('Forwarder', await CACHE.get('forwarder.address')).then((contract) => contract.connect(deployer)),
        staking: await utils.attach('FortaStaking', await CACHE.get('staking.address')).then((contract) => contract.connect(deployer)),
        subjectGateway: await utils.attach('StakeSubjectGateway', await CACHE.get('stake-subject-gateway.address')).then((contract) => contract.connect(deployer)),
        agents: await utils.attach('AgentRegistry', await CACHE.get('agents.address')).then((contract) => contract.connect(deployer)),
        scanners: await utils.attach('ScannerRegistry', await CACHE.get('scanners.address')).then((contract) => contract.connect(deployer)),
        dispatch: await utils.attach('Dispatch', await CACHE.get('dispatch.address')).then((contract) => contract.connect(deployer)),
        scannerNodeVersion: await utils.attach('ScannerNodeVersion', await CACHE.get('scanner-node-version.address')).then((contract) => contract.connect(deployer)),
    };

    const proposals = [];

    console.log('upgrading ScannerNodeVersion...');
    proposals.push(
        await upgrades.prepareUpgrade(contracts.scannerNodeVersion.address, await ethers.getContractFactory('ScannerNodeVersion', deployer), {
            unsafeAllow: ['delegatecall'],
            multisig: MULTISIG_ADDRESS,
            constructorArgs: [contracts.forwarder.address],
        })
    );
    console.log(proposals);
    console.log('ScannerNodeVersion proposed!');

    console.log('upgrading AgentRegistry...');

    proposals.push(
        await defender.proposeUpgrade(contracts.agents.address, await ethers.getContractFactory('AgentRegistry', deployer), {
            unsafeAllow: ['delegatecall'],
            multisig: MULTISIG_ADDRESS,
            constructorArgs: [contracts.forwarder.address],
            //proxyAdmin?: string,
        })
    );
    console.log('AgentRegistry proposed!');

    console.log('upgrading ScannerRegistry...');
    proposals.push(
        await defender.proposeUpgrade(contracts.scanners.address, await ethers.getContractFactory('ScannerRegistry', deployer), {
            unsafeAllow: ['delegatecall'],
            multisig: MULTISIG_ADDRESS,
            constructorArgs: [contracts.forwarder.address],
            //proxyAdmin?: string,
        })
    );
    console.log('ScannerRegistry proposed!');

    console.log('upgrading Dispatch...');

    proposals.push(
        await defender.proposeUpgrade(contracts.dispatch.address, await ethers.getContractFactory('Dispatch', deployer), {
            unsafeAllow: ['delegatecall'],
            multisig: MULTISIG_ADDRESS,
            constructorArgs: [contracts.forwarder.address],
            //proxyAdmin?: string,
        })
    );
    console.log('Dispatch proposed!');

    console.log('upgrading FortaStaking...');

    proposals.push(
        await defender.proposeUpgrade(contracts.staking.address, await ethers.getContractFactory('FortaStaking', deployer), {
            unsafeAllow: ['delegatecall'],
            multisig: MULTISIG_ADDRESS,
            constructorArgs: [contracts.forwarder.address],
            //proxyAdmin?: string,
        })
    );
    console.log('FortaStaking proposed!');

    console.log('upgrading StakeSubjectGateway...');

    proposals.push(
        await defender.proposeUpgrade(contracts.subjectGateway.address, await ethers.getContractFactory('StakeSubjectGateway', deployer), {
            unsafeAllow: ['delegatecall'],
            multisig: MULTISIG_ADDRESS,
            constructorArgs: [contracts.forwarder.address],
            //proxyAdmin?: string,
        })
    );
    console.log('StakeSubjectGateway proposed!');

    console.log(proposals.map((x) => x.url));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
