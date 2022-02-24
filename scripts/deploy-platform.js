const { ethers, upgrades, network } = require('hardhat');
const DEBUG                = require('debug')('forta:migration');
const utils                = require('./utils');
const SCANNER_SUBJECT = 0;
const AGENT_SUBJECT = 1;

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
        DEBUG('Unauthorized signer')
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
        ).then(tx => tx.wait())
        .catch(e => DEBUG(e))
    }
    if (resolved) {
        const currentResolved = await signer.provider.resolveName(name);
        DEBUG(resolved, currentResolved)

        if (resolved != currentResolved) {
            await resolver.connect(signer)['setAddr(bytes32,address)'](
                ethers.utils.namehash(name),
                resolved,
            ).then(tx => tx.wait())
            .catch(e => DEBUG(e))
        }

        if (signerAddress != owner) {
            await registry.connect(signer).setOwner(
                ethers.utils.namehash(name),
                owner,
            ).then(tx => tx.wait())
            .catch(e => DEBUG(e))
        }
    }
}

const reverseRegister = async (contract, name) => {
    const reverseResolved = await contract.provider.lookupAddress(contract.address);
    if (reverseResolved != name) {
        await contract.setName(
            contract.provider.network.ensAddress,
            name,
        ).then(tx => tx.wait())
        .catch(e => DEBUG(e))
    }
}

const CHILD_CHAIN_MANAGER_PROXY = {
    137:   '0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa',
    80001: '0xb5505a6d998549090530911180f38aC5130101c6',
};

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

    config.childChainManagerProxy = config.childChainManagerProxy ?? CHILD_CHAIN_MANAGER_PROXY[chainId];
    config.l2enable               = config.l2enable               ?? !!config.childChainManagerProxy;

    const contracts = {}

    contracts.forwarder = await ethers.getContractFactory('Forwarder', deployer).then(factory => utils.tryFetchContract(
        CACHE,
        'forwarder',
        factory,
        [],
    ));

    DEBUG(`[1] forwarder: ${contracts.forwarder.address}`);

    contracts.token = await ethers.getContractFactory(
        config.l2enable ? 'FortaBridgedPolygon' : 'Forta',
        deployer
    ).then(factory => utils.tryFetchProxy(
        CACHE,
        'forta',
        factory,
        'uups',
        [ deployer.address ],
        { constructorArgs: [ config.childChainManagerProxy ].filter(Boolean) },
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
      { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: ['delegatecall']},
    ));

    DEBUG(`[5.0] staking: ${contracts.staking.address}`);

    contracts.stakingParameters = await ethers.getContractFactory('FortaStakingParameters', deployer).then(factory => utils.tryFetchProxy(
        CACHE,
        'staking-parameters',
        factory,
        'uups',
        [ contracts.access.address, contracts.router.address, contracts.staking.address],
        { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: ['delegatecall']},
      ));
  
    DEBUG(`[5.1] staking parameters: ${contracts.stakingParameters.address}`);

    await contracts.stakingParameters.connect(deployer).setFortaStaking(contracts.staking.address)
    await contracts.staking.connect(deployer).setStakingParametersManager(contracts.stakingParameters.address)
    DEBUG(`[5.2] connected staking params and staking`);

    if (config.l2enable) {
        contracts.escrowFactory = await ethers.getContractFactory('StakingEscrowFactory', deployer).then(factory => utils.tryFetchContract(
            CACHE,
            'escrow-factory',
            factory,
            [ contracts.forwarder.address, contracts.staking.address ],
        ));

        DEBUG(`[5.3] escrow factory: ${contracts.escrowFactory.address}`);
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

    // Upgrades
    // Agents v0.1.2
    await contracts.agents.connect(deployer).setStakeController(contracts.stakingParameters.address)
    await contracts.stakingParameters.connect(deployer).setStakeSubjectHandler(AGENT_SUBJECT, contracts.agents.address)

    DEBUG(`[6.1] staking for agents configured`);


    contracts.scanners = await ethers.getContractFactory('ScannerRegistry', deployer).then(factory => utils.tryFetchProxy(
        CACHE,
        'scanners',
        factory,
        'uups',
        [ contracts.access.address, contracts.router.address, 'Forta Scanners', 'FScanners' ],
        { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
    ));

    DEBUG(`[7] scanners: ${contracts.scanners.address}`);

    // Scanners v0.1.1
    await contracts.scanners.connect(deployer).setStakeController(contracts.stakingParameters.address)
    await contracts.stakingParameters.connect(deployer).setStakeSubjectHandler(SCANNER_SUBJECT, contracts.scanners.address)

    DEBUG(`[7.1] staking for scanners configured`);

    contracts.dispatch = await ethers.getContractFactory('Dispatch', deployer).then(factory => utils.tryFetchProxy(
        CACHE,
        'dispatch',
        factory,
        'uups',
        [ contracts.access.address, contracts.router.address, contracts.agents.address, contracts.scanners.address ],
        { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
    ));

    DEBUG(`[8] dispatch: ${contracts.dispatch.address}`);

    contracts.scannerNodeVersion = await ethers.getContractFactory('ScannerNodeVersion', deployer).then(factory => utils.tryFetchProxy(
        CACHE,
        'scannerNodeVersion',
        factory,
        'uups',
        [ contracts.access.address, contracts.router.address ],
        { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
    ));

    DEBUG(`[9] scanner node version: ${contracts.scannerNodeVersion.address}`);

    // Roles dictionary
    const roles = await Promise.all(Object.entries({
        DEFAULT_ADMIN:        ethers.constants.HashZero,
        ADMIN:                ethers.utils.id('ADMIN_ROLE'),
        MINTER:               ethers.utils.id('MINTER_ROLE'),
        WHITELISTER:          ethers.utils.id('WHITELISTER_ROLE'),
        WHITELIST:            ethers.utils.id('WHITELIST_ROLE'),
        ROUTER_ADMIN:         ethers.utils.id('ROUTER_ADMIN_ROLE'),
        ENS_MANAGER:          ethers.utils.id('ENS_MANAGER_ROLE'),
        UPGRADER:             ethers.utils.id('UPGRADER_ROLE'),
        AGENT_ADMIN:          ethers.utils.id('AGENT_ADMIN_ROLE'),
        SCANNER_ADMIN:        ethers.utils.id('SCANNER_ADMIN_ROLE'),
        DISPATCHER:           ethers.utils.id('DISPATCHER_ROLE'),
        SLASHER:              ethers.utils.id('SLASHER_ROLE'),
        SWEEPER:              ethers.utils.id('SWEEPER_ROLE'),
        REWARDS_ADMIN:        ethers.utils.id('REWARDS_ADMIN_ROLE'),
        SCANNER_VERSION:      ethers.utils.id('SCANNER_VERSION_ROLE'),
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
        await registerNode(         'registries.forta.eth', deployer.address,              { ...contracts.ens,                                       });
        await Promise.all([
            registerNode(             'access.forta.eth', deployer.address,              { ...contracts.ens, resolved: contracts.access.address    }),
            registerNode(           'dispatch.forta.eth', deployer.address,              { ...contracts.ens, resolved: contracts.dispatch.address  }),
            registerNode(          'forwarder.forta.eth', deployer.address,              { ...contracts.ens, resolved: contracts.forwarder.address }),
            registerNode(             'router.forta.eth', deployer.address,              { ...contracts.ens, resolved: contracts.router.address    }),
            registerNode(            'staking.forta.eth', deployer.address,              { ...contracts.ens, resolved: contracts.staking.address   }),
            registerNode(     'staking-params.forta.eth', deployer.address,              { ...contracts.ens, resolved: contracts.stakingParameters.address   }),
            registerNode(  'agents.registries.forta.eth', deployer.address,              { ...contracts.ens, resolved: contracts.agents.address    }),
            registerNode('scanners.registries.forta.eth', deployer.address,              { ...contracts.ens, resolved: contracts.scanners.address  }),
            registerNode('scanner-node-version.forta.eth', deployer.address,              { ...contracts.ens, resolved: contracts.scannerNodeVersion.address  }),
            config.l2enable && registerNode('escrow.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.escrowFactory.address }),
        ]);

        DEBUG('[11.4] ens configuration')
    } else {
        contracts.ens = {};
        const ensRegistryAddress = await CACHE.get('ens-registry')
        contracts.ens.registry = ensRegistryAddress ? await utils.attach('ENSRegistry', ensRegistryAddress) : null;
        const ensResolverAddress = await CACHE.get('ens-resolver')
        contracts.ens.resolver = ensRegistryAddress ? await utils.attach('PublicResolver', ensResolverAddress) : null;
    }

    await Promise.all([
        reverseRegister(contracts.token,                            'forta.eth'),
        reverseRegister(contracts.access,                    'access.forta.eth'),
        reverseRegister(contracts.router,                    'router.forta.eth'),
        reverseRegister(contracts.dispatch,                'dispatch.forta.eth'),
        reverseRegister(contracts.staking,                  'staking.forta.eth'),
        reverseRegister(contracts.stakingParameters, 'staking-params.forta.eth'),
        reverseRegister(contracts.agents,         'agents.registries.forta.eth'),
        reverseRegister(contracts.scanners,     'scanners.registries.forta.eth'),
        reverseRegister(contracts.scannerNodeVersion, 'scanner-node-version.forta.eth'),
        // contract.escrow doesn't support reverse registration (not a component)
    ]);

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