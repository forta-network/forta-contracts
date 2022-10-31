const { ethers } = require('hardhat');
const utils = require('./utils');

const ROOT_CHAIN_MANAGER = {
    1: '0xA0c68C638235ee32657e8f720a23ceC1bFc77C77',
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

const DELAY = {
    137: utils.durationToSeconds('10 days'),
    8001: utils.durationToSeconds('10 minutes'),
};

const TREASURY = (chainId, deployer) => {
    switch (chainId) {
        case 5:
        case 80001:
        case 31337:
            return deployer.address;
        default:
            throw new Error('Treasury not configured for chainId: ', chainId);
    }
};

const SLASH_PERCENT_TO_PROPOSER = (chainId) => {
    switch (chainId) {
        case 5:
        case 80001:
        case 31337:
            return '10';
        default:
            throw new Error('SLASH_PERCENT_TO_PROPOSER not configured for chainId: ', chainId);
    }
};

const SLASHING_DEPOSIT_AMOUNT = (chainId) => {
    switch (chainId) {
        case 5:
        case 80001:
        case 31337:
            return ethers.utils.parseEther('1000');
        default:
            throw new Error('SLASHING_DEPOSIT_AMOUNT not configured for chainId: ', chainId);
    }
};

const SCANNER_REGISTRATION_DELAY = (chainId) => {
    switch (chainId) {
        case 5:
        case 80001:
        case 31337:
            return 1000;
        default:
            throw new Error('SCANNER_REGISTRATION_DELAY not configured for chainId: ', chainId);
    }
};

const MIGRATION_DURATION = (chainId) => {
    switch (chainId) {
        case 5:
        case 80001:
        case 31337:
            return 1000;
        default:
            throw new Error('MIGRATION_DURATION not configured for chainId: ', chainId);
    }
};

const FEE_PARAMS = (chainId) => {
    switch (chainId) {
        case 5:
        case 80001:
        case 31337:
            return [2, 1000];
        default:
            throw new Error('COMISSION_DELAY not configured for chainId: ', chainId);
    }
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
            ROUTER_ADMIN: ethers.utils.id('ROUTER_ADMIN_ROLE'),
            ENS_MANAGER: ethers.utils.id('ENS_MANAGER_ROLE'),
            UPGRADER: ethers.utils.id('UPGRADER_ROLE'),
            AGENT_ADMIN: ethers.utils.id('AGENT_ADMIN_ROLE'),
            SCANNER_ADMIN: ethers.utils.id('SCANNER_ADMIN_ROLE'),
            NODE_RUNNER_ADMIN: ethers.utils.id('NODE_RUNNER_ADMIN_ROLE'),
            DISPATCHER: ethers.utils.id('DISPATCHER_ROLE'),
            SLASHER: ethers.utils.id('SLASHER_ROLE'),
            SWEEPER: ethers.utils.id('SWEEPER_ROLE'),
            REWARDER: ethers.utils.id('REWARDER_ROLE'),
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
module.exports.DELAY = DELAY;
module.exports.TREASURY = TREASURY;
module.exports.SLASH_PERCENT_TO_PROPOSER = SLASH_PERCENT_TO_PROPOSER;
module.exports.SLASHING_DEPOSIT_AMOUNT = SLASHING_DEPOSIT_AMOUNT;
module.exports.SCANNER_REGISTRATION_DELAY = SCANNER_REGISTRATION_DELAY;
module.exports.MIGRATION_DURATION = MIGRATION_DURATION;
module.exports.FEE_PARAMS = FEE_PARAMS;
