const { ethers, upgrades } = require('hardhat');
const DEBUG                = require('debug')('forta:migration');
const utils                = require('./utils');

upgrades.silenceWarnings();

const registerNode = async (name, owner, opts = {}) => {
    const resolved      = opts.resolved;
    const registry      = opts.registry //?? contracts.ens.registry;
    const resolver      = opts.resolver //?? contracts.ens.resolver;
    const signer        = opts.signer   ?? registry.signer ?? resolver.signer;
    const signerAddress = await signer.getAddress();

    const [ label, ...self ]  = name.split('.');
    const parent = self.join('.');

    const parentOwner = await registry.owner(ethers.utils.namehash(parent));
    if (parentOwner != signerAddress) {
        throw new Error('Unauthorized signer');
    }

    const currentOwner = await registry.owner(ethers.utils.namehash(name));
    if (currentOwner == ethers.constants.AddressZero) {
        await registry.connect(signer).setSubnodeRecord(
            ethers.utils.namehash(parent),
            ethers.utils.id(label),
            resolved ? signerAddress : owner,
            resolver.address,
            0
        ).then(tx => tx.wait());
    }

    if (resolved) {
        const currentResolved = signer.provider.resolveName(name);
        if (resolved != currentResolved) {
            await resolver.connect(signer)['setAddr(bytes32,address)'](
                ethers.utils.namehash(name),
                resolved,
            ).then(tx => tx.wait());
        }

        if (signerAddress != owner) {
            await registry.connect(signer).setOwner(
                ethers.utils.namehash(name),
                owner,
            ).then(tx => tx.wait());
        }
    }
}

/*********************************************************************************************************************
 *                                                Migration workflow                                                 *
 *********************************************************************************************************************/
async function migrate(config = {}) {

    config.childChainManagerProxy = ethers.constants.AddressZero;

    const l2enable = !!config.childChainManagerProxy;
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

    contracts.token = await ethers.getContractFactory(
        l2enable ? 'FortaBridged' : 'Forta',
        deployer
    ).then(factory => utils.tryFetchProxy(
        CACHE,
        l2enable ? 'forta-bridge' : 'forta',
        factory,
        'uups',
        [ deployer.address, config.childChainManagerProxy ].filter(Boolean),
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

    if (l2enable) {
        contracts.escrowFactory = await ethers.getContractFactory('StakingEscrowFactory', deployer).then(factory => utils.tryFetchProxy(
            CACHE,
            'escrow-factory',
            factory,
            'uups',
            [ contracts.access.address, contracts.router.address ] ,
            { constructorArgs: [ contracts.forwarder.address, contracts.staking.address ], unsafeAllow: 'delegatecall' },
        ));

        DEBUG(`[5.2] escrow factory: ${contracts.escrowFactory.address}`);
    }

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
        [ contracts.access.address, contracts.router.address, contracts.agents.address, contracts.scanners.address ],
        { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
    ));

    DEBUG(`[8] dispatch: ${contracts.dispatch.address}`);

    contracts.alerts = await ethers.getContractFactory('Alerts', deployer).then(factory => utils.tryFetchProxy(
        CACHE,
        'alerts',
        factory,
        'uups',
        [ contracts.access.address, contracts.router.address, contracts.scanners.address ],
        { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
    ));

    DEBUG(`[9] alerts: ${contracts.alerts.address}`);

    // Roles dictionnary
    const roles = await Promise.all(Object.entries({
        DEFAULT_ADMIN: ethers.constants.HashZero,
        ADMIN:         ethers.utils.id('ADMIN_ROLE'),
        MINTER:        ethers.utils.id('MINTER_ROLE'),
        WHITELISTER:   ethers.utils.id('WHITELISTER_ROLE'),
        WHITELIST:     ethers.utils.id('WHITELIST_ROLE'),
        ROUTER_ADMIN:  ethers.utils.id('ROUTER_ADMIN_ROLE'),
        ENS_MANAGER:   ethers.utils.id('ENS_MANAGER_ROLE'),
        UPGRADER:      ethers.utils.id('UPGRADER_ROLE'),
        AGENT_ADMIN:   ethers.utils.id('AGENT_ADMIN_ROLE'),
        SCANNER_ADMIN: ethers.utils.id('SCANNER_ADMIN_ROLE'),
        DISPATCHER:    ethers.utils.id('DISPATCHER_ROLE'),
        SLASHER:       ethers.utils.id('SLASHER_ROLE'),
        SWEEPER:       ethers.utils.id('SWEEPER_ROLE'),
        BRIDGER:       ethers.utils.id('BRIDGER_ROLE'),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries);

    DEBUG('[10] roles fetched')

    await contracts.access.hasRole(roles.ENS_MANAGER, deployer.address)
        .then(result => result || contracts.access.grantRole(roles.ENS_MANAGER, deployer.address).then(tx => tx.wait()));

    if (!provider.network.ensAddress) {
        contracts.ens = {};

        // deploy contracts
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

        // link provider to registry
        provider.network.ensAddress = contracts.ens.registry.address;

        // ens registration
        await registerNode(                      'reverse', deployer.address,              { ...contracts.ens,                                       });
        await registerNode(                 'addr.reverse', contracts.ens.reverse.address, { ...contracts.ens,                                       });
        await registerNode(                          'eth', deployer.address,              { ...contracts.ens,                                       });
        await registerNode(                    'forta.eth', deployer.address,              { ...contracts.ens, resolved: contracts.token.address     });
        await registerNode(             'access.forta.eth', deployer.address,              { ...contracts.ens, resolved: contracts.access.address    });
        await registerNode(             'alerts.forta.eth', deployer.address,              { ...contracts.ens, resolved: contracts.alerts.address    });
        await registerNode(           'dispatch.forta.eth', deployer.address,              { ...contracts.ens, resolved: contracts.dispatch.address  });
        await registerNode(          'forwarder.forta.eth', deployer.address,              { ...contracts.ens, resolved: contracts.forwarder.address });
        await registerNode(             'router.forta.eth', deployer.address,              { ...contracts.ens, resolved: contracts.router.address    });
        await registerNode(            'staking.forta.eth', deployer.address,              { ...contracts.ens, resolved: contracts.staking.address   });
        await registerNode(         'registries.forta.eth', deployer.address,              { ...contracts.ens,                                       });
        await registerNode(  'agents.registries.forta.eth', deployer.address,              { ...contracts.ens, resolved: contracts.agents.address    });
        await registerNode('scanners.registries.forta.eth', deployer.address,              { ...contracts.ens, resolved: contracts.scanners.address  });

        if (l2enable) {
            await registerNode('escrow.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.escrowFactory.address });
        }

        DEBUG('[11.4] ens configuration')
    }

    await contracts.token   .setName(provider.network.ensAddress, 'forta.eth'                    );
    await contracts.access  .setName(provider.network.ensAddress, 'access.forta.eth'             );
    await contracts.alerts  .setName(provider.network.ensAddress, 'alerts.forta.eth'             );
    await contracts.router  .setName(provider.network.ensAddress, 'router.forta.eth'             );
    await contracts.dispatch.setName(provider.network.ensAddress, 'dispatch.forta.eth'           );
    await contracts.staking .setName(provider.network.ensAddress, 'staking.forta.eth'            );
    await contracts.agents  .setName(provider.network.ensAddress, 'agents.registries.forta.eth'  );
    await contracts.scanners.setName(provider.network.ensAddress, 'scanners.registries.forta.eth');

    if (l2enable) {
        await contracts.escrowFactory.setName(provider.network.ensAddress, 'escrow.forta.eth');
    }

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