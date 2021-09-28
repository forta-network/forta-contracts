const { ethers, upgrades } = require('hardhat');
const { NonceManager } = require('@ethersproject/experimental');



async function main() {
    // wrap provider to re-enable maxpriorityfee mechanism
    const provider = new ethers.providers.FallbackProvider([ ethers.provider ], 1);
    provider.getFeeData = () => Promise.resolve({
        maxFeePerGas:         ethers.utils.parseUnits('100', 'gwei'),
        maxPriorityFeePerGas: ethers.utils.parseUnits('5',   'gwei'),
    });

    // create new wallet on top of the wrapped provider
    // const deployer = await ethers.getSigner().then(signer => new NonceManager(signer));
    const deployer = new NonceManager(
        ethers.Wallet.fromMnemonic(process.env.MNEMONIC || 'test test test test test test test test test test test junk')
    ).connect(provider);
    await deployer.getTransactionCount().then(nonce => deployer.setTransactionCount(nonce));

    deployer.address = await deployer.getAddress();
    const { name, chainId } = await deployer.provider.getNetwork();

    ethers.provider.network.ensAddress = ethers.provider.network.ensAddress || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';

    console.log(`Network:  ${name} (${chainId})`);
    console.log(`Deployer: ${deployer.address}`);
    console.log('----------------------------------------------------');



    function getFactory(name) {
        return ethers.getContractFactory(name, deployer);
    }

    function attach(name, ...params) {
        return getFactory(name)
        .then(contract => contract.attach(...params));
    }

    function deploy(name, ...params) {
        return getFactory(name)
        .then(contract => contract.deploy(...params))
        .then(f => f.deployed());
    }

    function deployUpgradeable(name, kind, ...params) {
        return getFactory(name)
        .then(contract => upgrades.deployProxy(contract, params, { kind, unsafeAllow: [ 'delegatecall' ] }))
        .then(f => f.deployed());
    }

    function performUpgrade(proxy, name) {
        return getFactory(name)
        .then(contract => upgrades.upgradeProxy(proxy.address, contract, {}));
    }



    const contracts = {}

    // This #1
    Object.assign(contracts, await Promise.all(Object.entries({
        token:    attach('Forta',           '0x848F1fF1fa76Dc882Ca2F3521265ba3F27e42158'),
        access:   attach('AccessManager',   '0xb4457590d9f1e03bef165cc94ed82c63a1e5bb4d'),
        // token:    deployUpgradeable('Forta',           'uups', deployer.address),
        // access:   deployUpgradeable('AccessManager',   'uups', deployer.address),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries));

    console.log('[1] token & access deployed')

    // This #2
    Object.assign(contracts, await Promise.all(Object.entries({
        // router:   attach('Router',          '0x779f6Fa8826f013Ce7580B8e815a4257DaaaC8E2'),
        router:   deployUpgradeable('Router',          'uups', contracts.access.address),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries));

    console.log('[2] router deployed')

    // Components #1
    Object.assign(contracts, await Promise.all(Object.entries({
        staking:  attach('FortaStaking',    '0x2EB0de54842A3FaaD9C7724f68363b11eb72b4dB'),
        agents:   attach('AgentRegistry',   '0xa3a0ea252d3cf18b30c3ada0e013671beedb4262'),
        scanners: attach('ScannerRegistry', '0x65F22a702F88B53883A89F772449c7667DB9ab9C'),
        // staking:  deployUpgradeable('FortaStaking',    'uups', contracts.access.address, contracts.router.address, contracts.token.address, 0, deployer.address),
        // agents:   deployUpgradeable('AgentRegistry',   'uups', contracts.access.address, contracts.router.address, 'Forta Agents',   'FAgents'  ),
        // scanners: deployUpgradeable('ScannerRegistry', 'uups', contracts.access.address, contracts.router.address, 'Forta Scanners', 'FScanners'),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries));

    console.log('[3] staking, agents & scanners deployed')

    // Components #2
    Object.assign(contracts, await Promise.all(Object.entries({
        dispatch: attach('Dispatch',        '0x77Db997b9Ad5e14386aB367fa47de073b3743248'),
        alerts:   attach('Alerts',          '0xC0556fC048B0F189F412DBba536aBD1a4ebD1349'),
        // dispatch: deployUpgradeable('Dispatch',        'uups', contracts.access.address, contracts.router.address, contracts.agents.address, contracts.scanners.address),
        // alerts:   deployUpgradeable('Alerts',          'uups', contracts.access.address, contracts.router.address, contracts.scanners.address),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries));

    console.log('[4] alerts deployed')

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

    console.log('[5] roles fetched')

    // Setup roles #1
    await Promise.all(
        [ deployer.address, '0x8eedf056dE8d0B0fd282Cc0d7333488Cc5B5D242' ].flatMap(target => [
            // Forta roles are standalone
            contracts.token.hasRole(roles.MINTER,         target).then(value => value ? undefined : contracts.token.connect(deployer).grantRole(roles.MINTER,         target)),
            contracts.token.hasRole(roles.WHITELISTER,    target).then(value => value ? undefined : contracts.token.connect(deployer).grantRole(roles.WHITELISTER,    target)),
            // AccessManager roles
            contracts.access.hasRole(roles.ENS_MANAGER,   target).then(value => value ? undefined : contracts.access.connect(deployer).grantRole(roles.ENS_MANAGER,   target)),
            contracts.access.hasRole(roles.UPGRADER,      target).then(value => value ? undefined : contracts.access.connect(deployer).grantRole(roles.UPGRADER,      target)),
            contracts.access.hasRole(roles.AGENT_ADMIN,   target).then(value => value ? undefined : contracts.access.connect(deployer).grantRole(roles.AGENT_ADMIN,   target)),
            contracts.access.hasRole(roles.SCANNER_ADMIN, target).then(value => value ? undefined : contracts.access.connect(deployer).grantRole(roles.SCANNER_ADMIN, target)),
            contracts.access.hasRole(roles.DISPATCHER,    target).then(value => value ? undefined : contracts.access.connect(deployer).grantRole(roles.DISPATCHER,    target)),
        ])
        .map(txPromise => txPromise && txPromise.then(tx => tx && tx.wait()))
    );
    // Setup roles #2 (need to be whitelister to whitelist)
    await Promise.all(
        [].concat(
            contracts.token.hasRole(roles.WHITELIST, contracts.staking.address).then(value => value ? undefined : contracts.token.connect(deployer).grantRole(roles.WHITELIST, contracts.staking.address)),
            [ deployer.address, '0x8eedf056dE8d0B0fd282Cc0d7333488Cc5B5D242' ].flatMap(target => [
                contracts.token.hasRole(roles.WHITELIST, target).then(value => value ? undefined : contracts.token.connect(deployer).grantRole(roles.WHITELIST, target)),
            ]),
        )
        .map(txPromise => txPromise && txPromise.then(tx => tx && tx.wait()))
    );
    console.log('[6] roles granted')

    await Promise.all(Object.entries(contracts).map(([ name, { address }]) => upgrades.erc1967.getImplementationAddress(address).then(implementation =>
        console.log(`[${name.padEnd(8)}] addr: ${address} impl: ${implementation}`)
    )));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
