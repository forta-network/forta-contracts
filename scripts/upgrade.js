const { ethers } = require('hardhat');
const DEBUG                = require('debug')('forta');
const utils                = require('./utils');


async function main() {
    const provider = config?.provider ?? config?.deployer?.provider ?? await utils.getDefaultProvider();
    const deployer = config?.deployer ??                               await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });

    if (!provider.network.ensAddress) {
        provider.network.ensAddress = await CACHE.get('ens-registry');
    }

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`ENS:      ${provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG('----------------------------------------------------');

    const contracts = await Promise.all(Object.entries({
        forwarder: utils.attach('Forwarder',  await CACHE.get('forwarder.address') ).then(contract => contract.connect(deployer)),
        access: utils.attach('AccessManager',  await CACHE.get('access.address') ).then(contract => contract.connect(deployer)),
        staking: utils.attach('FortaStaking', await CACHE.get('staking.address')           ).then(contract => contract.connect(deployer)),
        agents: utils.attach('AgentRegistry',  await CACHE.get('agents.address')  ).then(contract => contract.connect(deployer)),
        scanners: utils.attach('ScannerRegistry',await CACHE.get('scanners.address')  ).then(contract => contract.connect(deployer)),
        dispatch: utils.attach('Dispatch', await CACHE.get('dispatch.address') ).then(contract => contract.connect(deployer)),
        scannerNodeVersion: utils.attach('ScannerNodeVersion', await CACHE.get('scanner-node-version.address') ).then(contract => contract.connect(deployer)),

    }).map(entry => Promise.all(entry))).then(Object.fromEntries);
    const UPGRADER_ROLE = ethers.utils.id('UPGRADER_ROLE')
    const isUpgrader = await contracts.access.hasRole(UPGRADER_ROLE, deployer.address)
    if (!isUpgrader) {
        await contracts.access.grantRole(UPGRADER_ROLE,      deployer.address        ).then(tx => tx.wait());
        console.log('Granted upgrader role to: ', deployer.address)
    }
    
    const AgentRegistry = await ethers.getContractFactory('AgentRegistry');
    const newAgentRegistry = await utils.performUpgrade(
        contracts.agents,
        AgentRegistry.connect(deployer),
        {
            call: {
                fn:'setStakeController(address)',
                args: [contracts.staking.address]
            },
            constructorArgs: [ contracts.forwarder.address ],
            unsafeAllow: ['delegatecall'],
            unsafeSkipStorageCheck: true
        },
        CACHE,
        'agents'
    );
    console.log('new Agent Registry: ', await upgrades.erc1967.getImplementationAddress(newAgentRegistry.address))
    
    
    const ScannerRegistry = await ethers.getContractFactory('ScannerRegistry');
    const newScannerRegistry = await utils.performUpgrade(
        contracts.scanners,
        ScannerRegistry.connect(deployer),
        {
            call: {
                fn:'setStakeController(address)',
                args: [contracts.staking.address]
            },
            constructorArgs: [ contracts.forwarder.address ],
            unsafeAllow: ['delegatecall'],
            unsafeSkipStorageCheck: true
        },
        CACHE,
        'scanners'
    );
    
    console.log('newScannerRegistry: ', await upgrades.erc1967.getImplementationAddress(newScannerRegistry.address))
    
    const Dispatch = await ethers.getContractFactory('Dispatch');
    const newDispatch = await utils.performUpgrade(
        contracts.dispatch,
        Dispatch.connect(deployer),
        {

            constructorArgs: [ contracts.forwarder.address ],
            unsafeAllow: ['delegatecall'],
        },
        CACHE,
        'dispatch'
    );

    console.log('newDispatch: ', await upgrades.erc1967.getImplementationAddress(newDispatch.address))

    const ScannerNodeVersion = await ethers.getContractFactory('ScannerNodeVersion');
    const newScannerNodeVersion = await utils.performUpgrade(
        contracts.scannerNodeVersion,
        ScannerNodeVersion.connect(deployer),
        {

            constructorArgs: [ contracts.forwarder.address ],
            unsafeAllow: ['delegatecall'],
        },
        CACHE,
        'scanner-node-version'
    );
    console.log('newScannerNodeVersion: ', await upgrades.erc1967.getImplementationAddress(newScannerNodeVersion.address))
    
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
