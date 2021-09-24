const { ethers, upgrades } = require('hardhat');
const { NonceManager } = require('@ethersproject/experimental');
// const chalk = require('chalk');
// const assert = require('assert');



function attach(name, ...params) {
    return ethers.getContractFactory(name)
    .then(contract => Contract.attach(...params));
}

function deploy(name, ...params) {
    return ethers.getContractFactory(name)
    .then(contract => contract.deploy(...params))
    .then(f => f.deployed());
}

function deployUpgradeable(name, kind, ...params) {
    return ethers.getContractFactory(name)
    .then(contract => upgrades.deployProxy(contract, params, { kind }))
    .then(f => f.deployed());
}

function performUpgrade(proxy, name) {
    return ethers.getContractFactory(name)
    .then(contract => upgrades.upgradeProxy(proxy.address, contract, {}));
}



async function main() {
    // wrap provider to re-enable maxpriorityfee mechanism
    const provider = new ethers.providers.FallbackProvider([ ethers.provider ], 1);
    // create new wallet on top of the wrapped provider
    const deployer = new NonceManager(
        ethers.Wallet.fromMnemonic('test test test test test test test test test test test junk')
        // ethers.Wallet.fromMnemonic(process.env.MNEMONIC || 'test test test test test test test test test test test junk')
    ).connect(provider);

    deployer.address = await deployer.getAddress();
    const { name, chainId } = await deployer.provider.getNetwork();

    ethers.provider.network.ensAddress = ethers.provider.network.ensAddress || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';

    console.log(`Network:  ${name} (${chainId})`);
    console.log(`Deployer: ${deployer.address}`);
    console.log('----------------------------------------------------');

    const contracts = {}

    // This #1
    Object.assign(contracts, await Promise.all(Object.entries({
        token:    deployUpgradeable('Forta',           'uups', deployer.address),
        access:   deployUpgradeable('AccessManager',   'uups', deployer.address),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries));

    // This #2
    Object.assign(contracts, await Promise.all(Object.entries({
        router:   deployUpgradeable('Router',          'uups', contracts.access.address),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries));

    // Components #1
    Object.assign(contracts, await Promise.all(Object.entries({
        staking:  deployUpgradeable('FortaStaking',    'uups', contracts.access.address, contracts.router.address, contracts.token.address, 0, deployer.address),
        agents:   deployUpgradeable('AgentRegistry',   'uups', contracts.access.address, contracts.router.address, 'Forta Agents',   'FAgents'  ),
        scanners: deployUpgradeable('ScannerRegistry', 'uups', contracts.access.address, contracts.router.address, 'Forta Scanners', 'FScanners'),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries));

    // Components #2
    Object.assign(contracts, await Promise.all(Object.entries({
        alerts:   deployUpgradeable('Alerts',          'uups', contracts.access.address, contracts.router.address, contracts.scanners.address),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries));

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
        SLASHER:       ethers.utils.id('SLASHER_ROLE'),
        SWEEPER:       ethers.utils.id('SWEEPER_ROLE'),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries);

    // Setup roles
    await Promise.all([
        // Forta roles are standalone
        contracts.token.connect(deployer).grantRole(roles.MINTER,        deployer.address),
        contracts.token.connect(deployer).grantRole(roles.WHITELISTER,   deployer.address),
        contracts.token.connect(deployer).grantRole(roles.WHITELIST,     contracts.staking.address),
        // AccessManager roles
        contracts.access.connect(deployer).grantRole(roles.ENS_MANAGER,   deployer.address),
        contracts.access.connect(deployer).grantRole(roles.UPGRADER,      deployer.address),
        contracts.access.connect(deployer).grantRole(roles.AGENT_ADMIN,   deployer.address),
        contracts.access.connect(deployer).grantRole(roles.SCANNER_ADMIN, deployer.address),
    ]);

    Object.entries(contracts).forEach(([ name, { address}]) => console.log(`- ${name}: ${address}`));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
