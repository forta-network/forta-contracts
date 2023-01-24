const hre = require('hardhat');
const { ethers } = hre;
const utils = require('./utils');
const contractHelpers = require('./utils/contractHelpers');
const stringUtils = require('./utils/stringUtils');
const AsyncConf = require('./utils/asyncConf');
const fs = require('fs');

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
            return 2 * 30 * 24 * 60 * 60; // 2 months
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

const loadRoles = () => {
    const rolesFileContents = fs.readFileSync('./contracts/components/Roles.sol', { encoding: 'utf8', flag: 'r' });
    const regex = /bytes32 constant [A-Z_0-9]*/g;
    const roleIds = rolesFileContents.match(regex).map((match) => match.replace('bytes32 constant ', ''));
    const roles = {};
    for (const id of roleIds) {
        if (id === 'DEFAULT_ADMIN_ROLE') {
            roles[id.replace('_ROLE', '')] = ethers.constants.HashZero;
        } else {
            roles[id.replace('_ROLE', '')] = ethers.utils.id(id);
        }
    }
    roles.MINTER = ethers.utils.id('MINTER_ROLE');
    return roles;
};

async function loadEnv(config = {}) {
    const provider = config?.provider ?? config?.deployer?.provider ?? (await contractHelpers.getDefaultProvider(hre));
    const deployer = config?.deployer ?? (await contractHelpers.getDefaultDeployer(hre, provider));

    const { name, chainId } = await provider.getNetwork();

    const chainType = ROOT_CHAIN_MANAGER[chainId] ? CHAIN_TYPE.ROOT : CHILD_CHAIN_MANAGER_PROXY[chainId] ? CHAIN_TYPE.CHILD : CHAIN_TYPE.DEV;
    const deploymentFileName = `.cache-${chainId}${chainId === 5 ? '-components' : ''}`;

    const CACHE = new AsyncConf({ cwd: __dirname, configName: deploymentFileName });
    const deployment = require(`./${deploymentFileName}.json`);

    provider.network.ensAddress = deployment['ens-registry']?.address || provider.network.ensAddress;

    const keys = Object.keys(deployment).filter((key) => !key.includes('pending') && !key.startsWith('vesting-') && !key.includes('ens-') && key !== 'contracts');
    const contracts = {};
    for (const key of keys) {
        const dep = deployment[key];
        const contractName = dep.impl ? dep.impl.name : dep.name;
        if (!contractName) continue;
        contracts[stringUtils.camelize(key)] = await contractHelpers.attach(hre, contractName, dep.address).then((contract) => contract.connect(deployer));
    }
    deployment.token = Object.assign({}, deployment.forta);
    contracts.token = Object.assign({}, contracts.forta);

    const roles = loadRoles();

    return {
        CACHE,
        chainType,
        provider,
        deployer,
        network: { name, chainId },
        contracts,
        roles,
        deployment,
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

module.exports.loadEnv = loadEnv;
module.exports.loadRoles = loadRoles;
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
