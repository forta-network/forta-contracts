const { ethers, upgrades } = require('hardhat');
const DEBUG                = require('debug')('forta');
const utils                = require('./utils');

upgrades.silenceWarnings();

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
        // token:     utils.attach('Forta',           'forta.eth'                    ).then(contract => contract.connect(deployer)),
        access:    utils.attach('AccessManager',   'access.forta.eth'             ).then(contract => contract.connect(deployer)),
        alerts:    utils.attach('Alerts',          'alerts.forta.eth'             ).then(contract => contract.connect(deployer)),
        dispatch:  utils.attach('Dispatch',        'dispatch.forta.eth'           ).then(contract => contract.connect(deployer)),
        router:    utils.attach('Router',          'router.forta.eth'             ).then(contract => contract.connect(deployer)),
        // staking:   utils.attach('FortaStaking',    'staking.forta.eth'            ).then(contract => contract.connect(deployer)),
        forwarder: utils.attach('Forwarder',       'forwarder.forta.eth'          ).then(contract => contract.connect(deployer)),
        agents:    utils.attach('AgentRegistry',   'agents.registries.forta.eth'  ).then(contract => contract.connect(deployer)),
        scanners:  utils.attach('ScannerRegistry', 'scanners.registries.forta.eth').then(contract => contract.connect(deployer)),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries);

    const roles = await Promise.all(Object.entries({
        // Forta
        // ADMIN:         contracts.token.ADMIN_ROLE(),
        // MINTER:        contracts.token.MINTER_ROLE(),
        // WHITELISTER:   contracts.token.WHITELISTER_ROLE(),
        // WHITELIST:     contracts.token.WHITELIST_ROLE(),
        // AccessManager / AccessManaged roles
        DEFAULT_ADMIN: ethers.constants.HashZero,
        ROUTER_ADMIN:  ethers.utils.id('ROUTER_ADMIN_ROLE'),
        ENS_MANAGER:   ethers.utils.id('ENS_MANAGER_ROLE'),
        UPGRADER:      ethers.utils.id('UPGRADER_ROLE'),
        AGENT_ADMIN:   ethers.utils.id('AGENT_ADMIN_ROLE'),
        SCANNER_ADMIN: ethers.utils.id('SCANNER_ADMIN_ROLE'),
        DISPATCHER:    ethers.utils.id('DISPATCHER_ROLE'),
        SLASHER:       ethers.utils.id('SLASHER_ROLE'),
        SWEEPER:       ethers.utils.id('SWEEPER_ROLE'),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries);

    // await contracts.access.grantRole(roles.UPGRADER,      deployer.address        ).then(tx => tx.wait());
    // await contracts.access.grantRole(roles.AGENT_ADMIN,   deployer.address        ).then(tx => tx.wait());
    // await contracts.access.grantRole(roles.SCANNER_ADMIN, deployer.address        ).then(tx => tx.wait());
    // await contracts.access.grantRole(roles.DISPATCHER,    deployer.address        ).then(tx => tx.wait());
    // await contracts.token .grantRole(roles.MINTER,        deployer.address        ).then(tx => tx.wait());
    // await contracts.token .grantRole(roles.WHITELISTER,   deployer.address        ).then(tx => tx.wait());
    // await contracts.token .grantRole(roles.WHITELIST,     contract.staking.address).then(tx => tx.wait());

    // await contracts.access.grantRole(roles.UPGRADER, deployer.address).then(tx => tx.wait());
    // await contracts.access.grantRole(roles.DISPATCHER, '0x9e857a04ebde96351878ddf3ad40164ff68c1ee1').then(tx => tx.wait());
    // await Promise.all(Object.values(contracts).map(contract => contract.setName(provider.network.ensAddress, contract.address).then(tx => tx.wait())));

    // await provider.resolveName(contracts.access.address  ).then(address => utils.getFactory('AccessManager'  ).then(factory => utils.performUpgrade({ address }, factory.connect(deployer), { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' })));
    // await provider.resolveName(contracts.router.address  ).then(address => utils.getFactory('Router'         ).then(factory => utils.performUpgrade({ address }, factory.connect(deployer), { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' })));
    // await provider.resolveName(contracts.staking.address ).then(address => utils.getFactory('FortaStaking'   ).then(factory => utils.performUpgrade({ address }, factory.connect(deployer), { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' })));
    // await provider.resolveName(contracts.agents.address  ).then(address => utils.getFactory('AgentRegistry'  ).then(factory => utils.performUpgrade({ address }, factory.connect(deployer), { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' })));
    // await provider.resolveName(contracts.scanners.address).then(address => utils.getFactory('ScannerRegistry').then(factory => utils.performUpgrade({ address }, factory.connect(deployer), { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' })));
    // await provider.resolveName(contracts.dispatch.address).then(address => utils.getFactory('Dispatch'       ).then(factory => utils.performUpgrade({ address }, factory.connect(deployer), { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' })));
    // await provider.resolveName(contracts.alerts.address  ).then(address => utils.getFactory('Alerts'         ).then(factory => utils.performUpgrade({ address }, factory.connect(deployer), { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' })));

    await Promise.all(
        Object.entries(contracts).map(([ name, contracts ]) => provider.resolveName(contracts.address)
        .then(address => upgrades.erc1967.getImplementationAddress(address)
            .then(implementation => [ name, { ens: contracts.address, address, implementation} ])
            .catch(() => [ name, { ens: contracts.address, address } ])
        ))
    )
    .then(Object.fromEntries)
    .then(result => JSON.stringify(result, 0, 4))
    .then(DEBUG);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
