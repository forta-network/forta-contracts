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

    function attach(name, address) {
        return getFactory(name)
        .then(contract => contract.attach(address));
    }

    function deploy(name, params = []) {
        return getFactory(name)
        .then(contract => contract.deploy(...params))
        .then(f => f.deployed());
    }

    function deployUpgradeable(name, kind, params = [], opts = {}) {
        return getFactory(name)
        .then(contract => upgrades.deployProxy(contract, params, { kind, ...opts }))
        .then(f => f.deployed());
    }

    function performUpgrade(proxy, name, opts = {}) {
        return getFactory(name)
        .then(contract => upgrades.upgradeProxy(proxy.address, contract, opts));
    }

    const contracts = await Promise.all(Object.entries({
        token:     attach('Forta',           'forta.eth'),
        forwarder: attach('Forwarder',       'forwarder.forta.eth'),
        access:    attach('AccessManager',   'accessmanager.forta.eth'),
        router:    attach('Router',          'router.forta.eth'),
        staking:   attach('FortaStaking',    'staking.forta.eth'),
        agents:    attach('AgentRegistry',   'agents.registries.forta.eth'),
        scanners:  attach('ScannerRegistry', 'scanners.registries.forta.eth'),
        dispatch:  attach('Dispatch',        'dispatch.forta.eth'),
        alerts:    attach('Alerts',          'alerts.forta.eth'),
        alerts:    attach('Alerts',          'alerts.forta.eth'),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries);

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

    // await contracts.access.grantRole(roles.DISPATCHER, '0x9e857a04ebde96351878ddf3ad40164ff68c1ee1').then(tx => tx.wait());
    // await Promise.all(Object.values(contracts).map(contract => contract.setName(ethers.provider.network.ensAddress, contract.address).then(tx => tx.wait())));

    // await ethers.provider.resolveName(contracts.access.address  ).then(address => performUpgrade({ address }, 'AccessManager',   { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' }));
    // await ethers.provider.resolveName(contracts.router.address  ).then(address => performUpgrade({ address }, 'Router',          { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' }));
    // await ethers.provider.resolveName(contracts.staking.address ).then(address => performUpgrade({ address }, 'FortaStaking',    { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' }));
    // await ethers.provider.resolveName(contracts.agents.address  ).then(address => performUpgrade({ address }, 'AgentRegistry',   { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' }));
    // await ethers.provider.resolveName(contracts.scanners.address).then(address => performUpgrade({ address }, 'ScannerRegistry', { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' }));
    // await ethers.provider.resolveName(contracts.dispatch.address).then(address => performUpgrade({ address }, 'Dispatch',        { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' }));
    // await ethers.provider.resolveName(contracts.alerts.address  ).then(address => performUpgrade({ address }, 'Alerts',          { constructorArgs: [ contracts.forwarder.address ], unsafeAllow: 'delegatecall' }));

    console.log('done');

    await Promise.all(
        Object.entries(contracts).map(([ name, contracts ]) => ethers.provider.resolveName(contracts.address)
        .then(address => upgrades.erc1967.getImplementationAddress(address)
            .then(implementation => [ name, { ens: contracts.address, address, implementation} ])
            .catch(() => [ name, { ens: contracts.address, address } ])
        ))
    )
    .then(Object.fromEntries)
    .then(result => JSON.stringify(result, 0, 4))
    .then(console.log);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
