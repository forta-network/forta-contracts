const { ethers } = require('hardhat');
const utils = require('./utils');

const ROOT_CHAIN_MANAGER = {
    1: '0x0D29aDA4c818A9f089107201eaCc6300e56E0d5c',
    5: '0xBbD7cBFA79faee899Eaf900F13C9065bF03B1A74',
};

const CHILD_CHAIN_MANAGER_PROXY = {
    137: '0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa',
    80001: '0xb5505a6d998549090530911180f38aC5130101c6',
};

const CHAIN_TYPE = {
    ROOT: 0x1,
    CHILD: 0x2,
    DEV: 0x3,
};

async function loadEnv(config = {}) {
    const provider = config?.provider ?? config?.deployer?.provider ?? (await utils.getDefaultProvider());
    const deployer = config?.deployer ?? (await utils.getDefaultDeployer(provider));

    const { name, chainId } = await provider.getNetwork();
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });

    const chainType = ROOT_CHAIN_MANAGER[chainId] ? CHAIN_TYPE.ROOT : CHILD_CHAIN_MANAGER_PROXY[chainId] ? CHAIN_TYPE.CHILD : CHAIN_TYPE.DEV;

    provider.network.ensAddress = (await CACHE.get('ens-registry')) || provider.network.ensAddress;

    const contracts = await Promise.all(
        Object.entries({
            token: chainType && utils.attach(chainType & CHAIN_TYPE.ROOT ? 'Forta' : 'FortaBridgedPolygon', 'forta.eth').then((contract) => contract.connect(deployer)),
            access: chainType & CHAIN_TYPE.CHILD && utils.attach('AccessManager', 'access.forta.eth').then((contract) => contract.connect(deployer)),
            dispatch: chainType & CHAIN_TYPE.CHILD && utils.attach('Dispatch', 'dispatch.forta.eth').then((contract) => contract.connect(deployer)),
            router: chainType & CHAIN_TYPE.CHILD && utils.attach('Router', 'router.forta.eth').then((contract) => contract.connect(deployer)),
            staking: chainType & CHAIN_TYPE.CHILD && utils.attach('FortaStaking', 'staking.forta.eth').then((contract) => contract.connect(deployer)),
            forwarder: chainType & CHAIN_TYPE.CHILD && utils.attach('Forwarder', 'forwarder.forta.eth').then((contract) => contract.connect(deployer)),
            agents: chainType & CHAIN_TYPE.CHILD && utils.attach('AgentRegistry', 'agents.registries.forta.eth').then((contract) => contract.connect(deployer)),
            scanners: chainType & CHAIN_TYPE.CHILD && utils.attach('ScannerRegistry', 'scanners.registries.forta.eth').then((contract) => contract.connect(deployer)),
            escrow: chainType & CHAIN_TYPE.CHILD && utils.attach('StakingEscrowFactory', 'escrow.forta.eth').then((contract) => contract.connect(deployer)),
        })
            .filter((entry) => entry.every(Boolean))
            .map((entry) => Promise.all(entry))
    ).then(Object.fromEntries);

    const roles = await Promise.all(
        Object.entries({
            DEFAULT_ADMIN: ethers.constants.HashZero,
            ADMIN: ethers.utils.id('ADMIN_ROLE'),
            MINTER: ethers.utils.id('MINTER_ROLE'),
            WHITELISTER: ethers.utils.id('WHITELISTER_ROLE'),
            WHITELIST: ethers.utils.id('WHITELIST_ROLE'),
            ROUTER_ADMIN: ethers.utils.id('ROUTER_ADMIN_ROLE'),
            ENS_MANAGER: ethers.utils.id('ENS_MANAGER_ROLE'),
            UPGRADER: ethers.utils.id('UPGRADER_ROLE'),
            AGENT_ADMIN: ethers.utils.id('AGENT_ADMIN_ROLE'),
            SCANNER_ADMIN: ethers.utils.id('SCANNER_ADMIN_ROLE'),
            DISPATCHER: ethers.utils.id('DISPATCHER_ROLE'),
            SLASHER: ethers.utils.id('SLASHER_ROLE'),
            SWEEPER: ethers.utils.id('SWEEPER_ROLE'),
            REWARDS_ADMIN: ethers.utils.id('REWARDS_ADMIN_ROLE'),
        }).map((entry) => Promise.all(entry))
    ).then(Object.fromEntries);

    return {
        CACHE,
        chainType,
        provider,
        deployer,
        network: { name, chainId },
        contracts,
        roles,
    };
}

if (require.main === module) {
    loadEnv()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = loadEnv;
module.exports.ROOT_CHAIN_MANAGER = ROOT_CHAIN_MANAGER;
module.exports.CHILD_CHAIN_MANAGER_PROXY = CHILD_CHAIN_MANAGER_PROXY;
module.exports.CHAIN_TYPE = CHAIN_TYPE;
