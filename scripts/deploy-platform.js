const { ethers, upgrades } = require('hardhat');
const { NonceManager     } = require('@ethersproject/experimental');
const config               = require('dotenv').config()
const DEBUG                = require('debug')('migration');

upgrades.silenceWarnings();

const DEFAULT_FEE_DATA = {
    maxFeePerGas:         ethers.utils.parseUnits('100', 'gwei'),
    maxPriorityFeePerGas: ethers.utils.parseUnits('5',   'gwei'),
};

const revert = (error = 'unspecified error') => {
    throw new Error(error)
}

const getDefaultProvider = () => {
    return ethers.provider ?? revert('provider not found');
}

const getDefaultDeployer = (provider) => {
    return ethers.Wallet.fromMnemonic(config.MNEMONIC ?? 'test test test test test test test test test test test junk').connect(provider)
}

const wrapProvider = async (
    baseProvider,
    feeData,
) => {
    const provider  = new ethers.providers.FallbackProvider([ baseProvider ], 1);
    provider.getFeeData = () => Promise.resolve(Object.assign(DEFAULT_FEE_DATA, feeData));
    return provider;
}

const wrapDeployer = async (
    baseDeployer,
) => {
    const deployer = new NonceManager(baseDeployer).connect(baseDeployer.provider);
    await deployer.getTransactionCount().then(nonce => deployer.setTransactionCount(nonce));
    deployer.address = await deployer.getAddress();
    return deployer;
}

function getFactory(name) {
    return ethers.getContractFactory(name);
}

function attach(factory, address) {
    return (typeof factory === 'string' ? getFactory(factory) : Promise.resolve(factory))
    .then(contract => contract.attach(address));
}

function deploy(factory, params = []) {
    return (typeof factory === 'string' ? getFactory(factory) : Promise.resolve(factory))
    .then(contract => contract.deploy(...params))
    .then(f => f.deployed());
}

function deployUpgradeable(factory, kind, params = [], opts = {}) {
    return (typeof factory === 'string' ? getFactory(factory) : Promise.resolve(factory))
    .then(contract => upgrades.deployProxy(contract, params, { kind, ...opts }))
    .then(f => f.deployed());
}

function performUpgrade(proxy, factory, opts = {}) {
    return (typeof factory === 'string' ? getFactory(factory) : Promise.resolve(factory))
    .then(contract => upgrades.upgradeProxy(proxy.address, contract, opts));
}

async function migrate(config) {
    const provider = await wrapProvider(config?.provider ?? config?.deployer?.provider ?? await getDefaultProvider())
    const deployer = await wrapDeployer(config?.deployer ??                               await getDefaultDeployer(provider));

    const { name, chainId } = await deployer.provider.getNetwork();
    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`ENS:      ${ethers.provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG('----------------------------------------------------');

    const contracts = {}

    // Contracts #0
    Object.assign(contracts, await Promise.all(Object.entries({
        forwarder: deploy(getFactory('Forwarder').then(factory => factory.connect(deployer))),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries));

    // Contracts #1
    Object.assign(contracts, await Promise.all(Object.entries({
        token: deployUpgradeable(
            getFactory('Forta').then(factory => factory.connect(deployer)),
            'uups',
            [ deployer.address ],
        ),
        access: deployUpgradeable(
            getFactory('AccessManager').then(factory => factory.connect(deployer)),
            'uups',
            [ deployer.address ],
            { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' }
        ),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries));

    DEBUG('[1] token & access deployed')

    // Contracts #2
    Object.assign(contracts, await Promise.all(Object.entries({
        router: deployUpgradeable(
            getFactory('Router').then(factory => factory.connect(deployer)),
            'uups',
            [ contracts.access.address ],
            { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
        ),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries));

    DEBUG('[2] router deployed')

    // Contracts #3
    Object.assign(contracts, await Promise.all(Object.entries({
        staking: deployUpgradeable(
            getFactory('FortaStaking').then(factory => factory.connect(deployer)),
            'uups',
            [ contracts.access.address, contracts.router.address, contracts.token.address, 0, deployer.address ],
            { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
        ),
        agents: deployUpgradeable(
            getFactory('AgentRegistry').then(factory => factory.connect(deployer)),
            'uups',
            [ contracts.access.address, contracts.router.address, 'Forta Agents', 'FAgents' ],
            { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
        ),
        scanners: deployUpgradeable(
            getFactory('ScannerRegistry').then(factory => factory.connect(deployer)),
            'uups',
            [ contracts.access.address, contracts.router.address, 'Forta Scanners', 'FScanners' ],
            { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
        ),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries));

    DEBUG('[3] staking, agents & scanners deployed')

    // Contracts #4
    Object.assign(contracts, await Promise.all(Object.entries({
        dispatch: deployUpgradeable(
            getFactory('Dispatch').then(factory => factory.connect(deployer)),
            'uups',
            [ contracts.access.address, contracts.router.address, contracts.agents.address, contracts.scanners.address],
            { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
        ),
        alerts: deployUpgradeable(
            getFactory('Alerts').then(factory => factory.connect(deployer)),
            'uups',
            [ contracts.access.address, contracts.router.address, contracts.scanners.address],
            { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
        ),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries));

    DEBUG('[4] alerts deployed')

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

    DEBUG('[5] roles fetched')

    if (!ethers.provider.network.ensAddress) {
        const registry = await deploy(getFactory('ENSRegistry'     ).then(factory => factory.connect(deployer)), []);
        const resolver = await deploy(getFactory('PublicResolver'  ).then(factory => factory.connect(deployer)), [ registry.address, ethers.constants.AddressZero ]);
        const reverse  = await deploy(getFactory('ReverseRegistrar').then(factory => factory.connect(deployer)), [ registry.address, resolver.address ]);

        await Promise.all([
            // Set node in registry
            registry.setSubnodeOwner (ethers.utils.namehash(''                    ), ethers.utils.id('reverse'   ), deployer.address                     ),
            registry.setSubnodeOwner (ethers.utils.namehash('reverse'             ), ethers.utils.id('addr'      ), reverse.address                      ),
            registry.setSubnodeOwner (ethers.utils.namehash(''                    ), ethers.utils.id('eth'       ), deployer.address                     ),
            registry.setSubnodeRecord(ethers.utils.namehash('eth'                 ), ethers.utils.id('forta'     ), deployer.address, resolver.address, 0),
            registry.setSubnodeRecord(ethers.utils.namehash('forta.eth'           ), ethers.utils.id('access'    ), deployer.address, resolver.address, 0),
            registry.setSubnodeRecord(ethers.utils.namehash('forta.eth'           ), ethers.utils.id('alerts'    ), deployer.address, resolver.address, 0),
            registry.setSubnodeRecord(ethers.utils.namehash('forta.eth'           ), ethers.utils.id('dispatch'  ), deployer.address, resolver.address, 0),
            registry.setSubnodeRecord(ethers.utils.namehash('forta.eth'           ), ethers.utils.id('router'    ), deployer.address, resolver.address, 0),
            registry.setSubnodeRecord(ethers.utils.namehash('forta.eth'           ), ethers.utils.id('staking'   ), deployer.address, resolver.address, 0),
            registry.setSubnodeOwner (ethers.utils.namehash('forta.eth'           ), ethers.utils.id('registries'), deployer.address                     ),
            registry.setSubnodeRecord(ethers.utils.namehash('registries.forta.eth'), ethers.utils.id('scanner'   ), deployer.address, resolver.address, 0),
            registry.setSubnodeRecord(ethers.utils.namehash('registries.forta.eth'), ethers.utils.id('agents'    ), deployer.address, resolver.address, 0),
            // configure resolver
            resolver['setAddr(bytes32,address)'](ethers.utils.namehash('forta.eth'                   ), contracts.token.address   ),
            resolver['setAddr(bytes32,address)'](ethers.utils.namehash('access.forta.eth'            ), contracts.access.address  ),
            resolver['setAddr(bytes32,address)'](ethers.utils.namehash('alerts.forta.eth'            ), contracts.alerts.address  ),
            resolver['setAddr(bytes32,address)'](ethers.utils.namehash('dispatch.forta.eth'          ), contracts.router.address  ),
            resolver['setAddr(bytes32,address)'](ethers.utils.namehash('router.forta.eth'            ), contracts.dispatch.address),
            resolver['setAddr(bytes32,address)'](ethers.utils.namehash('staking.forta.eth'           ), contracts.staking.address ),
            resolver['setAddr(bytes32,address)'](ethers.utils.namehash('scanner.registries.forta.eth'), contracts.agents.address  ),
            resolver['setAddr(bytes32,address)'](ethers.utils.namehash('agents.registries.forta.eth' ), contracts.scanners.address),
        ].map(txPromise => txPromise.then(tx => tx.wait())));

        ethers.provider.network.ensAddress = registry.address;
    }

    // reverse registration
    await Promise.all([
        contracts.access.grantRole(roles.ENS_MANAGER, deployer.address),
        contracts.token   .setName(ethers.provider.network.ensAddress, 'forta.eth'                   ),
        contracts.access  .setName(ethers.provider.network.ensAddress, 'access.forta.eth'            ),
        contracts.alerts  .setName(ethers.provider.network.ensAddress, 'alerts.forta.eth'            ),
        contracts.router  .setName(ethers.provider.network.ensAddress, 'router.forta.eth'            ),
        contracts.dispatch.setName(ethers.provider.network.ensAddress, 'dispatch.forta.eth'          ),
        contracts.staking .setName(ethers.provider.network.ensAddress, 'staking.forta.eth'           ),
        contracts.agents  .setName(ethers.provider.network.ensAddress, 'agents.registries.forta.eth' ),
        contracts.scanners.setName(ethers.provider.network.ensAddress, 'scanner.registries.forta.eth'),
    ].map(txPromise => txPromise.then(tx => tx.wait())));

    DEBUG('[6] ens deployment (if needed) and reverse registration')

    await Promise.all(
        Object.entries(contracts).map(([ name, contracts ]) => ethers.provider.resolveName(contracts.address)
        .then(address => upgrades.erc1967.getImplementationAddress(address)
            .then(implementation => [ name, { ens: contracts.address, address, implementation} ])
            .catch(() => [ name, { ens: contracts.address, address } ])
        ))
    )
    .then(Object.fromEntries)
    .then(result => JSON.stringify(result, 0, 4))
    .then(DEBUG);


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
Object.assign(module.exports, {
    getFactory,
    attach,
    deploy,
    deployUpgradeable,
    performUpgrade,
});