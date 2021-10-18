const { ethers, upgrades } = require('hardhat');
const DEBUG                = require('debug')('forta:migration');
const utils                = require('./utils');

upgrades.silenceWarnings();

/*********************************************************************************************************************
 *                                                Migration workflow                                                 *
 *********************************************************************************************************************/
async function migrate(config = {}) {
    const provider = config?.provider ?? config?.deployer?.provider ?? await utils.getDefaultProvider();
    const deployer = config?.deployer ??                               await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();
    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`ENS:      ${provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`Balance:  ${await provider.getBalance(deployer.address).then(ethers.utils.formatEther)}${ethers.constants.EtherSymbol}`);
    DEBUG('----------------------------------------------------');

    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });
    if (config?.force) { CACHE.clear(); }

    const contracts = {}

    contracts.forwarder = await ethers.getContractFactory('Forwarder', deployer).then(factory => utils.tryFetchContract(
        CACHE,
        'forwarder',
        factory,
        [],
    ));

    DEBUG(`[1] forwarder: ${contracts.forwarder.address}`);

    contracts.token = await ethers.getContractFactory('Forta', deployer).then(factory => utils.tryFetchProxy(
        CACHE,
        'forta',
        factory,
        'uups',
        [ deployer.address ],
    ));

    DEBUG(`[2] forta: ${contracts.token.address}`);

    contracts.access = await ethers.getContractFactory('AccessManager', deployer).then(factory => utils.tryFetchProxy(
        CACHE,
        'access',
        factory,
        'uups',
        [ deployer.address ],
        { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
    ));

    DEBUG(`[3] access: ${contracts.access.address}`);

    contracts.router = await ethers.getContractFactory('Router', deployer).then(factory => utils.tryFetchProxy(
        CACHE,
        'router',
        factory,
        'uups',
        [ contracts.access.address ],
        { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
    ));

    DEBUG(`[4] router: ${contracts.router.address}`);

    contracts.staking = await ethers.getContractFactory('FortaStaking', deployer).then(factory => utils.tryFetchProxy(
        CACHE,
        'staking',
        factory,
        'uups',
        [ contracts.access.address, contracts.router.address, contracts.token.address, 0, deployer.address ],
        { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
    ));

    DEBUG(`[5] staking: ${contracts.staking.address}`);

    contracts.agents = await ethers.getContractFactory('AgentRegistry', deployer).then(factory => utils.tryFetchProxy(
        CACHE,
        'agents',
        factory,
        'uups',
        [ contracts.access.address, contracts.router.address, 'Forta Agents', 'FAgents' ],
        { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
    ));

    DEBUG(`[6] agents: ${contracts.agents.address}`);

    contracts.scanners = await ethers.getContractFactory('ScannerRegistry', deployer).then(factory => utils.tryFetchProxy(
        CACHE,
        'scanners',
        factory,
        'uups',
        [ contracts.access.address, contracts.router.address, 'Forta Scanners', 'FScanners' ],
        { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
    ));

    DEBUG(`[7] scanners: ${contracts.scanners.address}`);

    contracts.dispatch = await ethers.getContractFactory('Dispatch', deployer).then(factory => utils.tryFetchProxy(
        CACHE,
        'dispatch',
        factory,
        'uups',
        [ contracts.access.address, contracts.router.address, contracts.agents.address, contracts.scanners.address],
        { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
    ));

    DEBUG(`[8] dispatch: ${contracts.dispatch.address}`);


    contracts.alerts = await ethers.getContractFactory('Alerts', deployer).then(factory => utils.tryFetchProxy(
        CACHE,
        'alerts',
        factory,
        'uups',
        [ contracts.access.address, contracts.router.address, contracts.scanners.address],
        { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
    ));

    DEBUG(`[9] alerts: ${contracts.alerts.address}`);

    // Roles dictionnary
    const roles = await Promise.all(Object.entries({
        // Forta
        ADMIN:         contracts.token.ADMIN_ROLE(),
        MINTER:        contracts.token.MINTER_ROLE(),
        WHITELISTER:   contracts.token.WHITELISTER_ROLE(),
        WHITELIST:     contracts.token.WHITELIST_ROLE(),
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

    DEBUG('[10] roles fetched')

    // TODO: check before set
    await contracts.access.grantRole(roles.ENS_MANAGER, deployer.address).then(tx => tx.wait());

    if (!provider.network.ensAddress) {
        contracts.ens = {};

        contracts.ens.registry = await ethers.getContractFactory('ENSRegistry', deployer).then(factory => utils.tryFetchContract(
            CACHE,
            'ens-registry',
            factory,
            [],
        ));

        DEBUG(`[11.1] registry: ${contracts.ens.registry.address}`);

        contracts.ens.resolver = await ethers.getContractFactory('PublicResolver', deployer).then(factory => utils.tryFetchContract(
            CACHE,
            'ens-resolver',
            factory,
            [ contracts.ens.registry.address, ethers.constants.AddressZero ],
        ));

        DEBUG(`[11.2] resolver: ${contracts.ens.resolver.address}`);

        contracts.ens.reverse = await ethers.getContractFactory('ReverseRegistrar', deployer).then(factory => utils.tryFetchContract(
            CACHE,
            'ens-reverse',
            factory,
            [ contracts.ens.registry.address, contracts.ens.resolver.address ],
        ));

        DEBUG(`[11.3] reverse: ${contracts.ens.reverse.address}`);

        // TODO: check before set
        await contracts.ens.registry.setSubnodeOwner (ethers.utils.namehash(''                    ), ethers.utils.id('reverse'   ), deployer.address                                   ).then(tx => tx.wait())
        await contracts.ens.registry.setSubnodeOwner (ethers.utils.namehash('reverse'             ), ethers.utils.id('addr'      ), contracts.ens.reverse.address                      ).then(tx => tx.wait())
        await contracts.ens.registry.setSubnodeOwner (ethers.utils.namehash(''                    ), ethers.utils.id('eth'       ), deployer.address                                   ).then(tx => tx.wait())
        await contracts.ens.registry.setSubnodeRecord(ethers.utils.namehash('eth'                 ), ethers.utils.id('forta'     ), deployer.address, contracts.ens.resolver.address, 0).then(tx => tx.wait())
        await contracts.ens.registry.setSubnodeOwner (ethers.utils.namehash('forta.eth'           ), ethers.utils.id('registries'), deployer.address                                   ).then(tx => tx.wait())

        await Promise.all([
            contracts.ens.registry.setSubnodeRecord(ethers.utils.namehash('forta.eth'           ), ethers.utils.id('access'    ), deployer.address, contracts.ens.resolver.address, 0),
            contracts.ens.registry.setSubnodeRecord(ethers.utils.namehash('forta.eth'           ), ethers.utils.id('alerts'    ), deployer.address, contracts.ens.resolver.address, 0),
            contracts.ens.registry.setSubnodeRecord(ethers.utils.namehash('forta.eth'           ), ethers.utils.id('dispatch'  ), deployer.address, contracts.ens.resolver.address, 0),
            contracts.ens.registry.setSubnodeRecord(ethers.utils.namehash('forta.eth'           ), ethers.utils.id('forwarder' ), deployer.address, contracts.ens.resolver.address, 0),
            contracts.ens.registry.setSubnodeRecord(ethers.utils.namehash('forta.eth'           ), ethers.utils.id('router'    ), deployer.address, contracts.ens.resolver.address, 0),
            contracts.ens.registry.setSubnodeRecord(ethers.utils.namehash('forta.eth'           ), ethers.utils.id('staking'   ), deployer.address, contracts.ens.resolver.address, 0),
            contracts.ens.registry.setSubnodeRecord(ethers.utils.namehash('registries.forta.eth'), ethers.utils.id('agents'    ), deployer.address, contracts.ens.resolver.address, 0),
            contracts.ens.registry.setSubnodeRecord(ethers.utils.namehash('registries.forta.eth'), ethers.utils.id('scanners'  ), deployer.address, contracts.ens.resolver.address, 0),
        ].map(txPromise => txPromise.then(tx => tx.wait())));

        // configure resolver
        await Promise.all([
            contracts.ens.resolver['setAddr(bytes32,address)'](ethers.utils.namehash('forta.eth'                    ), contracts.token.address    ),
            contracts.ens.resolver['setAddr(bytes32,address)'](ethers.utils.namehash('access.forta.eth'             ), contracts.access.address   ),
            contracts.ens.resolver['setAddr(bytes32,address)'](ethers.utils.namehash('alerts.forta.eth'             ), contracts.alerts.address   ),
            contracts.ens.resolver['setAddr(bytes32,address)'](ethers.utils.namehash('dispatch.forta.eth'           ), contracts.dispatch.address ),
            contracts.ens.resolver['setAddr(bytes32,address)'](ethers.utils.namehash('forwarder.forta.eth'          ), contracts.forwarder.address),
            contracts.ens.resolver['setAddr(bytes32,address)'](ethers.utils.namehash('router.forta.eth'             ), contracts.router.address   ),
            contracts.ens.resolver['setAddr(bytes32,address)'](ethers.utils.namehash('staking.forta.eth'            ), contracts.staking.address  ),
            contracts.ens.resolver['setAddr(bytes32,address)'](ethers.utils.namehash('agents.registries.forta.eth'  ), contracts.agents.address   ),
            contracts.ens.resolver['setAddr(bytes32,address)'](ethers.utils.namehash('scanners.registries.forta.eth'), contracts.scanners.address ),
        ].map(txPromise => txPromise.then(tx => tx.wait())));

        DEBUG('[11.4] ens configuration')

        provider.network.ensAddress = contracts.ens.registry.address;
    }

    // TODO: check before set
    await Promise.all([
        contracts.token   .setName(provider.network.ensAddress, 'forta.eth'                    ),
        contracts.access  .setName(provider.network.ensAddress, 'access.forta.eth'             ),
        contracts.alerts  .setName(provider.network.ensAddress, 'alerts.forta.eth'             ),
        contracts.router  .setName(provider.network.ensAddress, 'router.forta.eth'             ),
        contracts.dispatch.setName(provider.network.ensAddress, 'dispatch.forta.eth'           ),
        contracts.staking .setName(provider.network.ensAddress, 'staking.forta.eth'            ),
        contracts.agents  .setName(provider.network.ensAddress, 'agents.registries.forta.eth'  ),
        contracts.scanners.setName(provider.network.ensAddress, 'scanners.registries.forta.eth'),
    ].map(txPromise => txPromise.then(tx => tx.wait())));

    DEBUG('[11.5] reverse registration')

    return {
        provider,
        deployer,
        contracts,
        roles,
    }
}

if (require.main === module) {
    migrate()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = migrate;