const { ethers, upgrades } = require('hardhat');
const { NonceManager     } = require('@ethersproject/experimental');
const config               = require('dotenv').config()
const DEBUG                = require('debug')('migration');

upgrades.silenceWarnings();

const DEFAULT_FEE_DATA = {
    maxFeePerGas:         ethers.utils.parseUnits('100', 'gwei'),
    maxPriorityFeePerGas: ethers.utils.parseUnits('5',   'gwei'),
};

const getDefaultProvider = async (
    baseProvider = ethers.provider,
    feeData      = {},
) => {
    const provider  = new ethers.providers.FallbackProvider([ baseProvider ], 1);
    provider.getFeeData = () => Promise.resolve(Object.assign(DEFAULT_FEE_DATA, feeData));
    return provider;
}

const getDefaultDeployer = async (
    provider,
    baseDeployer = ethers.Wallet.fromMnemonic(config.MNEMONIC ?? 'test test test test test test test test test test test junk')
) => {
    const deployer = new NonceManager(baseDeployer).connect(provider);
    await deployer.getTransactionCount().then(nonce => deployer.setTransactionCount(nonce));
    deployer.address = await deployer.getAddress();
    return deployer;
}

/*********************************************************************************************************************
 *                                                  Async safe Conf                                                  *
 *********************************************************************************************************************/
const Conf = require('conf');
const pLimit = require('p-limit');

class AsyncConf extends Conf {
    constructor(conf) {
        super(conf);
        this.limit = pLimit(1);
    }

    get(key) {
        return this.limit(() => super.get(key));
    }

    set(key, value) {
        return this.limit(() => super.set(key, value));
    }

    async getFallback(key, fallback) {
        const value = await this.get(key) || await fallback();
        await this.set(key, value);
        return value;
    }

    async expect(key, value) {
        const fromCache = await this.get(key);
        if (fromCache) {
            assert.deepStrictEqual(value, fromCache);
            return false;
        } else {
            await this.set(key, value);
            return true;
        }
    }
}

/*********************************************************************************************************************
 *                                                Blockchain helpers                                                 *
 *********************************************************************************************************************/
function tryFetchContract(cache, key, contract, args = []) {
    return resumeOrDeploy(cache, key, () => contract.deploy(...args)).then(address => contract.attach(address));
}

function tryFetchProxy(cache, key, contract, kind = 'uups', args = [], opts = {}) {
    return resumeOrDeploy(cache, key, () => upgrades.deployProxy(contract, args, { kind, ...opts })).then(address => contract.attach(address));
}

async function resumeOrDeploy(cache, key, deploy) {
    let txHash  = await cache.get(`${key}-pending`);
    let address = await cache.get(key);

    if (!txHash && !address) {
        const contract = await deploy();
        txHash = contract.deployTransaction.hash;
        await cache.set(`${key}-pending`, txHash);
        await contract.deployed();
        address = contract.address;
        await cache.set(key, address);
    } else if (!address) {
        address = await ethers.provider.getTransaction(txHash)
        .then(tx => tx.wait())
        .then(receipt => receipt.contractAddress);
        await cache.set(key, address);
    }

    return address;
}

/*********************************************************************************************************************
 *                                                Migration workflow                                                 *
 *********************************************************************************************************************/
async function migrate(config = {}) {
    const provider = config?.provider ?? config?.deployer?.provider ?? await getDefaultProvider();
    const deployer = config?.deployer ??                               await getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();
    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`ENS:      ${provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG('----------------------------------------------------');

    const CACHE = new AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });
    if (config?.force) { CACHE.clear(); }

    const contracts = {}

    contracts.forwarder = await ethers.getContractFactory('Forwarder', deployer).then(factory => tryFetchContract(
        CACHE,
        'forwarder',
        factory,
        [],
    ));

    DEBUG(`[1] forwarder: ${contracts.forwarder.address}`);

    contracts.token = await ethers.getContractFactory('Forta', deployer).then(factory => tryFetchProxy(
        CACHE,
        'forta',
        factory,
        'uups',
        [ deployer.address ],
    ));

    DEBUG(`[2] forta: ${contracts.token.address}`);

    contracts.access = await ethers.getContractFactory('AccessManager', deployer).then(factory => tryFetchProxy(
        CACHE,
        'access',
        factory,
        'uups',
        [ deployer.address ],
        { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
    ));

    DEBUG(`[3] access: ${contracts.access.address}`);

    contracts.router = await ethers.getContractFactory('Router', deployer).then(factory => tryFetchProxy(
        CACHE,
        'router',
        factory,
        'uups',
        [ contracts.access.address ],
        { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
    ));

    DEBUG(`[4] router: ${contracts.router.address}`);

    contracts.staking = await ethers.getContractFactory('FortaStaking', deployer).then(factory => tryFetchProxy(
        CACHE,
        'staking',
        factory,
        'uups',
        [ contracts.access.address, contracts.router.address, contracts.token.address, 0, deployer.address ],
        { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
    ));

    DEBUG(`[5] staking: ${contracts.staking.address}`);

    contracts.agents = await ethers.getContractFactory('AgentRegistry', deployer).then(factory => tryFetchProxy(
        CACHE,
        'agents',
        factory,
        'uups',
        [ contracts.access.address, contracts.router.address, 'Forta Agents', 'FAgents' ],
        { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
    ));

    DEBUG(`[6] agents: ${contracts.agents.address}`);

    contracts.scanners = await ethers.getContractFactory('ScannerRegistry', deployer).then(factory => tryFetchProxy(
        CACHE,
        'scanners',
        factory,
        'uups',
        [ contracts.access.address, contracts.router.address, 'Forta Scanners', 'FScanners' ],
        { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
    ));

    DEBUG(`[7] scanners: ${contracts.scanners.address}`);

    contracts.dispatch = await ethers.getContractFactory('Dispatch', deployer).then(factory => tryFetchProxy(
        CACHE,
        'dispatch',
        factory,
        'uups',
        [ contracts.access.address, contracts.router.address, contracts.agents.address, contracts.scanners.address],
        { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' },
    ));

    DEBUG(`[8] dispatch: ${contracts.dispatch.address}`);


    contracts.alerts = await ethers.getContractFactory('Alerts', deployer).then(factory => tryFetchProxy(
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

    if (!provider.network.ensAddress) {
        contracts.registry = await ethers.getContractFactory('ENSRegistry', deployer).then(factory => tryFetchContract(
            CACHE,
            'ens-registry',
            factory,
            [],
        ));

        contracts.resolver = await ethers.getContractFactory('PublicResolver', deployer).then(factory => tryFetchContract(
            CACHE,
            'ens-resolver',
            factory,
            [ contracts.registry.address, ethers.constants.AddressZero ],
        ));

        contracts.reverse = await ethers.getContractFactory('ReverseRegistrar', deployer).then(factory => tryFetchContract(
            CACHE,
            'ens-reverse',
            factory,
            [ contracts.registry.address, contracts.resolver.address ],
        ));

        // TODO: check before set
        await Promise.all([
            // Set node in registry
            contracts.registry.setSubnodeOwner (ethers.utils.namehash(''                    ), ethers.utils.id('reverse'   ), deployer.address                               ),
            contracts.registry.setSubnodeOwner (ethers.utils.namehash('reverse'             ), ethers.utils.id('addr'      ), contracts.reverse.address                      ),
            contracts.registry.setSubnodeOwner (ethers.utils.namehash(''                    ), ethers.utils.id('eth'       ), deployer.address                               ),
            contracts.registry.setSubnodeRecord(ethers.utils.namehash('eth'                 ), ethers.utils.id('forta'     ), deployer.address, contracts.resolver.address, 0),
            contracts.registry.setSubnodeRecord(ethers.utils.namehash('forta.eth'           ), ethers.utils.id('access'    ), deployer.address, contracts.resolver.address, 0),
            contracts.registry.setSubnodeRecord(ethers.utils.namehash('forta.eth'           ), ethers.utils.id('alerts'    ), deployer.address, contracts.resolver.address, 0),
            contracts.registry.setSubnodeRecord(ethers.utils.namehash('forta.eth'           ), ethers.utils.id('dispatch'  ), deployer.address, contracts.resolver.address, 0),
            contracts.registry.setSubnodeRecord(ethers.utils.namehash('forta.eth'           ), ethers.utils.id('router'    ), deployer.address, contracts.resolver.address, 0),
            contracts.registry.setSubnodeRecord(ethers.utils.namehash('forta.eth'           ), ethers.utils.id('staking'   ), deployer.address, contracts.resolver.address, 0),
            contracts.registry.setSubnodeOwner (ethers.utils.namehash('forta.eth'           ), ethers.utils.id('registries'), deployer.address                               ),
            contracts.registry.setSubnodeRecord(ethers.utils.namehash('registries.forta.eth'), ethers.utils.id('scanner'   ), deployer.address, contracts.resolver.address, 0),
            contracts.registry.setSubnodeRecord(ethers.utils.namehash('registries.forta.eth'), ethers.utils.id('agents'    ), deployer.address, contracts.resolver.address, 0),
            // configure resolver
            contracts.resolver['setAddr(bytes32,address)'](ethers.utils.namehash('forta.eth'                   ), contracts.token.address   ),
            contracts.resolver['setAddr(bytes32,address)'](ethers.utils.namehash('access.forta.eth'            ), contracts.access.address  ),
            contracts.resolver['setAddr(bytes32,address)'](ethers.utils.namehash('alerts.forta.eth'            ), contracts.alerts.address  ),
            contracts.resolver['setAddr(bytes32,address)'](ethers.utils.namehash('dispatch.forta.eth'          ), contracts.router.address  ),
            contracts.resolver['setAddr(bytes32,address)'](ethers.utils.namehash('router.forta.eth'            ), contracts.dispatch.address),
            contracts.resolver['setAddr(bytes32,address)'](ethers.utils.namehash('staking.forta.eth'           ), contracts.staking.address ),
            contracts.resolver['setAddr(bytes32,address)'](ethers.utils.namehash('scanner.registries.forta.eth'), contracts.agents.address  ),
            contracts.resolver['setAddr(bytes32,address)'](ethers.utils.namehash('agents.registries.forta.eth' ), contracts.scanners.address),
        ].map(txPromise => txPromise.then(tx => tx.wait())));

        provider.network.ensAddress = contracts.registry.address;
    }

    // reverse registration
    // TODO: check before set
    await Promise.all([
        contracts.access.grantRole(roles.ENS_MANAGER, deployer.address),
        contracts.token   .setName(provider.network.ensAddress, 'forta.eth'                   ),
        contracts.access  .setName(provider.network.ensAddress, 'access.forta.eth'            ),
        contracts.alerts  .setName(provider.network.ensAddress, 'alerts.forta.eth'            ),
        contracts.router  .setName(provider.network.ensAddress, 'router.forta.eth'            ),
        contracts.dispatch.setName(provider.network.ensAddress, 'dispatch.forta.eth'          ),
        contracts.staking .setName(provider.network.ensAddress, 'staking.forta.eth'           ),
        contracts.agents  .setName(provider.network.ensAddress, 'agents.registries.forta.eth' ),
        contracts.scanners.setName(provider.network.ensAddress, 'scanner.registries.forta.eth'),
    ].map(txPromise => txPromise.then(tx => tx.wait())));

    DEBUG('[11] ens deployment (if needed) and reverse registration')

    // await Promise.all(
    //     Object.entries(contracts).map(([ name, contracts ]) => provider.resolveName(contracts.address)
    //     .then(address => upgrades.erc1967.getImplementationAddress(address)
    //         .then(implementation => [ name, { ens: contracts.address, address, implementation} ])
    //         .catch(() => [ name, { ens: contracts.address, address } ])
    //     ))
    // )
    // .then(Object.fromEntries)
    // .then(result => JSON.stringify(result, 0, 4))
    // .then(DEBUG);

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