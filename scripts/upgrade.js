const { ethers, upgrades } = require('hardhat');
const DEBUG                = require('debug')('forta');
const utils                = require('./utils');

//upgrades.silenceWarnings();

const upgradesCache = {

    "agents": {
        "0.1.1": {
            "contract": "AgentRegistry_0_1_1"
        },
        "0.1.2": {
            "contract": "AgentRegistry",
        }
    }
    
    
}

async function upgradeImpl(chainId, key, version, call = undefined, constructorArgs = [], unsafeAllow = []) {
    console.log(chainId, key, version)
    const allParams = upgradesCache[key][version]
    console.log(allParams)
    console.log(call)
    console.log(constructorArgs)
    console.log(unsafeAllow)

    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });
    console.log(key)
    const NewImplementation = await ethers.getContractFactory(allParams.contract);
    return upgrades.upgradeProxy(
        await CACHE.get(key),
        NewImplementation,
        {
            call: call,
            constructorArgs: constructorArgs,
            unsafeAllow: unsafeAllow
        }
    );

} 

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
        forwarder: utils.attach('Forwarder',  await CACHE.get('forwarder') ).then(contract => contract.connect(deployer)),
        access: utils.attach('AccessManager',  await CACHE.get('access') ).then(contract => contract.connect(deployer)),
        staking: utils.attach('FortaStaking', await CACHE.get('staking')           ).then(contract => contract.connect(deployer)),
        agents: utils.attach('AgentRegistry',  await CACHE.get('agents')  ).then(contract => contract.connect(deployer)),
        scanners: utils.attach('ScannerRegistry',await CACHE.get('scanners')  ).then(contract => contract.connect(deployer)),
        dispatch: utils.attach('Dispatch', await CACHE.get('dispatch') ).then(contract => contract.connect(deployer)),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries);
    const UPGRADER_ROLE = ethers.utils.id('UPGRADER_ROLE')
    const isUpgrader = await contracts.access.hasRole(UPGRADER_ROLE, deployer.address)
    if (!isUpgrader) {
        await contracts.access.grantRole(UPGRADER_ROLE,      deployer.address        ).then(tx => tx.wait());
        console.log('Granted upgrader role to: ', deployer.address)
    }
    /*
    const AgentRegistry = await ethers.getContractFactory('AgentRegistry');
    const newAgentRegistry = await upgrades.upgradeProxy(
        contracts.agents.address,
        AgentRegistry,
        {
            call: {
                fn:'setStakeController(address)',
                args: [contracts.staking.address]
            },
            constructorArgs: [ contracts.forwarder.address ],
            unsafeAllow: ['delegatecall'],
            unsafeSkipStorageCheck: true
        }
    );
    console.log('new Agent Registry: ', await upgrades.erc1967.getImplementationAddress(newAgentRegistry.address))
    */
    
    const ScannerRegistry = await ethers.getContractFactory('ScannerRegistry');
    const newScannerRegistry = await upgrades.upgradeProxy(
        contracts.scanners.address,
        ScannerRegistry,
        {
            call: {
                fn:'setStakeController(address)',
                args: [contracts.staking.address]
            },
            constructorArgs: [ contracts.forwarder.address ],
            unsafeAllow: ['delegatecall'],
            unsafeSkipStorageCheck: true
        }
    );
    
    console.log('newScannerRegistry: ', await upgrades.erc1967.getImplementationAddress(newScannerRegistry.address))
        /*
    const Dispatch = await ethers.getContractFactory('Dispatch');
    const newDispatch = await upgrades.upgradeProxy(
        dispatch.address,
        Dispatch,
        {

            constructorArgs: [ contracts.forwarder.address ],
            unsafeAllow: ['delegatecall'],
            //unsafeSkipStorageCheck: true
        }
    );

    console.log('newDispatch: ', await upgrades.erc1967.getImplementationAddress(newDispatch.address))
    */
/*
    const contracts = await Promise.all(Object.entries({
        access:    utils.attach('AccessManager',   'access.forta.eth'             ).then(contract => contract.connect(deployer)),
        forwarder: utils.attach('Forwarder',       'forwarder.forta.eth'          ).then(contract => contract.connect(deployer)),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries);

    const roles = await Promise.all(Object.entries({

        REWARDS_ADMIN: ethers.utils.id('REWARDS_ADMIN_ROLE'), 
    }).map(entry => Promise.all(entry))).then(Object.fromEntries);

    // await contracts.access.grantRole(roles.UPGRADER,      deployer.address        ).then(tx => tx.wait());
   */
    //upgrade()
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });

module.exports = {
    upgradeImpl
}