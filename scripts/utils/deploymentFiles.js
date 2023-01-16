const { kebabize } = require('./stringUtils.js');
const AsyncConf = require('./asyncConf');
const { readFileSync, existsSync } = require('fs');
const { getAddress } = require('@ethersproject/address');

const RELEASES_PATH = './releases';

async function saveImplementation(cache, contractName, constructorArgs, initArgs, implAddress, version) {
    const key = kebabize(contractName);
    await cache.set(`${key}.impl.address`, implAddress);
    await cache.set(`${key}.impl.constructor-args`, constructorArgs ?? []);
    await cache.set(`${key}.impl.init-args`, initArgs ?? []);
    await cache.set(`${key}.impl.name`, contractName);
    // await cache.set(`${key}.impl.verified`, false);
    await cache.set(`${key}.impl.version`, version);
}

async function saveNonUpgradeable(cache, contractName, constructorArgs, address, version) {
    const key = kebabize(contractName);
    await cache.set(`${key}.address`, address);
    await cache.set(`${key}.constructor-args`, constructorArgs);
    await cache.set(`${key}.name`, contractName);
    await cache.set(`${key}.version`, version);
    // await cache.set(`${key}.verified`, (await cache.get(`${key}.verified`)) ?? false);
}

async function saveProposedImplementation(cache, contractName, constructorArgs, implAddress, version) {
    const key = kebabize(contractName);
    await cache.set(`${key}.proposedImpl.args`, constructorArgs ?? []);
    await cache.set(`${key}.proposedImpl.address`, implAddress);
    await cache.set(`${key}.proposedImpl.name`, contractName);
    // await cache.set(`${key}.proposedImpl.verified`, (await cache.get(`${key}.proposedImpl.verified`)) ?? false);
    await cache.set(`${key}.proposedImpl.version`, version);
}

const CHAIN_NAME = {
    1: 'mainnet',
    5: 'goerli',
    137: 'polygon',
    80001: 'mumbai',
};

function validateInput(chainId, releaseVersion) {
    if (!chainId) {
        throw new Error(`Invalid chainId ${chainId}`);
    }
    if (!releaseVersion) {
        throw new Error(`Invalid releaseVersion ${releaseVersion}`);
    }
}

function getDeployConfig(chainId, releaseVersion) {
    validateInput(chainId, releaseVersion);
    return JSON.parse(readFileSync(`${RELEASES_PATH}/${releaseVersion}/${CHAIN_NAME[chainId]}/config/deploy.json`).toString());
}

function deployConfigExists(chainId, releaseVersion) {
    validateInput(chainId, releaseVersion);
    const path = `${RELEASES_PATH}/${releaseVersion}/${CHAIN_NAME[chainId]}/output/deployed.json`;
    console.log(path)
    return existsSync(path);
}

function getUpgradesConfig(chainId, releaseVersion) {
    validateInput(chainId, releaseVersion);
    return JSON.parse(readFileSync(`${RELEASES_PATH}/${releaseVersion}/${CHAIN_NAME[chainId]}/config/upgrade.json`).toString());
}

function upgradeConfigExists(chainId, releaseVersion) {
    validateInput(chainId, releaseVersion);
    const path = `${RELEASES_PATH}/${releaseVersion}/${CHAIN_NAME[chainId]}/config/upgrade.json`;
    return existsSync(path);
}

function getDeployOutputwriter(chainId, releaseVersion) {
    validateInput(chainId, releaseVersion);
    return new AsyncConf({ cwd: `${RELEASES_PATH}/${releaseVersion}/${CHAIN_NAME[chainId]}/output/`, configName: 'deployed' });
}

function getUpgradeOutputwriter(chainId, releaseVersion) {
    validateInput(chainId, releaseVersion);
    return new AsyncConf({ cwd: `${RELEASES_PATH}/${releaseVersion}/${CHAIN_NAME[chainId]}/output/`, configName: 'prepared-upgrades' });
}

function getDeployment(chainId) {
    if (!chainId) {
        throw new Error(`Invalid chainId ${chainId}`);
    }
    return JSON.parse(readFileSync(`${RELEASES_PATH}/deployments/${chainId}.json`).toString());
}

function getDeployed(chainId, releaseVersion) {
    validateInput(chainId, releaseVersion);
    const path = `${RELEASES_PATH}/${releaseVersion}/${CHAIN_NAME[chainId]}/output/deployed.json`;
    if (existsSync(path)) {
        return Object.fromEntries(
            Object.entries(JSON.parse(readFileSync(`${RELEASES_PATH}/${releaseVersion}/${CHAIN_NAME[chainId]}/output/deployed.json`).toString())).filter(
                ([key, info]) => !key.includes('-deploy-tx')
            )
        );
    } else {
        return {};
    }
}

function getDeployedImplementations(chainId, releaseVersion) {
    validateInput(chainId, releaseVersion);
    const path = `${RELEASES_PATH}/${releaseVersion}/${CHAIN_NAME[chainId]}/output/prepared-upgrades.json`;
    if (existsSync(path)) {
        return JSON.parse(readFileSync(path).toString());
    } else {
        return {};
    }
}

function getDeploymentOutputWriter(chainId) {
    if (!chainId) {
        throw new Error(`Invalid chainId ${chainId}`);
    }
    return new AsyncConf({ cwd: `${RELEASES_PATH}/deployments/`, configName: `${chainId}` });
}

function getProxyOrContractAddress(deployment, key) {
    return getAddress(deployment[key].address);
}

function setAddressesInParams(deployment, params) {
    return params.map((arg) => {
        if (typeof arg === 'string') {
            if (arg.startsWith('deployment.')) {
                return getProxyOrContractAddress(deployment, arg.replace('deployment.', ''));
            }
            return arg;
        } else {
            return arg;
        }
    });
}

function getMultisigAddress(chainId) {
    const multisigs = JSON.parse(readFileSync(`${RELEASES_PATH}/deployments/multisigs.json`).toString());
    return getAddress(multisigs[CHAIN_NAME[chainId]]);
}

module.exports = {
    saveImplementation,
    saveProposedImplementation,
    saveNonUpgradeable,
    getDeployConfig,
    deployConfigExists,
    getUpgradesConfig,
    upgradeConfigExists,
    getDeployOutputwriter,
    getDeploymentOutputWriter,
    getUpgradeOutputwriter,
    getDeployment,
    getDeployed,
    getDeployedImplementations,
    setAddressesInParams,
    getMultisigAddress,
    getProxyOrContractAddress,
};
