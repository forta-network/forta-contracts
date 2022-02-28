const { ethers } = require('hardhat');
const DEBUG                = require('debug')('forta');
const utils                = require('./utils');

const CHILD_CHAIN_MANAGER_PROXY = {
    137:   '0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa',
    80001: '0xb5505a6d998549090530911180f38aC5130101c6',
};

async function main() {
    const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    const childChainManagerProxy = CHILD_CHAIN_MANAGER_PROXY[chainId] ?? false;

    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });

    if (!provider.network.ensAddress) {
        provider.network.ensAddress = await CACHE.get('ens-registry');
    }

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`ENS:      ${provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`childChainManagerProxy: ${childChainManagerProxy}`);
    DEBUG('----------------------------------------------------');

    if (name !== 'hardhat' && deployer.address === '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266') {
        throw new Error('using hardhat key for other network')
    }

    const contracts = await Promise.all(Object.entries({
        forta: utils.attach(childChainManagerProxy ? 'FortaBridgedPolygon' : 'Forta',  await CACHE.get('forta.address') ).then(contract => contract.connect(deployer)),
        forwarder: utils.attach('Forwarder',  await CACHE.get('forwarder.address') ).then(contract => contract.connect(deployer)),
        access: utils.attach('AccessManager',  await CACHE.get('access.address') ).then(contract => contract.connect(deployer)),
        staking: utils.attach('FortaStaking', await CACHE.get('staking.address')           ).then(contract => contract.connect(deployer)),
        agents: utils.attach('AgentRegistry',  await CACHE.get('agents.address')  ).then(contract => contract.connect(deployer)),
        scanners: utils.attach('ScannerRegistry',await CACHE.get('scanners.address')  ).then(contract => contract.connect(deployer)),
        dispatch: utils.attach('Dispatch', await CACHE.get('dispatch.address') ).then(contract => contract.connect(deployer)),
        router: utils.attach('Router',  await CACHE.get('router.address') ).then(contract => contract.connect(deployer)),
        scannerNodeVersion: utils.attach('ScannerNodeVersion', await CACHE.get('scanner-node-version.address') ).then(contract => contract.connect(deployer)),

    }).map(entry => Promise.all(entry))).then(Object.fromEntries);


    const UPGRADER_ROLE = ethers.utils.id('UPGRADER_ROLE')
    const isUpgrader = await contracts.access.hasRole(UPGRADER_ROLE, deployer.address)
    if (!isUpgrader) {
        await contracts.access.grantRole(UPGRADER_ROLE,      deployer.address        ).then(tx => tx.wait());
        console.log('Granted upgrader role to: ', deployer.address)
    }

    const Forta = await ethers.getContractFactory(childChainManagerProxy ? 'FortaBridgedPolygon' : 'Forta');
    console.log('Upgrading ',childChainManagerProxy ? 'FortaBridgedPolygon' : 'Forta')
    const newForta = await utils.performUpgrade(
        contracts.forta,
        Forta.connect(deployer),
        {
            constructorArgs: [ childChainManagerProxy ].filter(Boolean),
            unsafeAllow: ['delegatecall'],
            unsafeSkipStorageCheck: true
        },
        CACHE,
        'forta'
    );
    console.log('newForta: ', await upgrades.erc1967.getImplementationAddress(newForta.address))
    
    const AccessManager = await ethers.getContractFactory('AccessManager');
    const newAccessManager = await utils.performUpgrade(
        contracts.access,
        AccessManager.connect(deployer),
        {
            constructorArgs: [ contracts.forwarder.address ],
            unsafeAllow: ['delegatecall'],
        },
        CACHE,
        'access'
    );
    console.log('newAccessManager: ', await upgrades.erc1967.getImplementationAddress(newAccessManager.address))

    const Router = await ethers.getContractFactory('Router');
    const newRouter = await utils.performUpgrade(
        contracts.router,
        Router.connect(deployer),
        {
            constructorArgs: [ contracts.forwarder.address ],
            unsafeAllow: ['delegatecall'],
            unsafeSkipStorageCheck: true
        },
        CACHE,
        'router'
    );

    console.log('newRouter: ', await upgrades.erc1967.getImplementationAddress(newRouter.address))

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
