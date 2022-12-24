const { kebabize } = require('./stringUtils.js');
const AsyncConf = require('./asyncConf');
const { readFileSync } = require('fs');

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

const FOLDER_FOR_CHAIN = {
    1: 'mainnet',
    5: 'goerli',
    137: 'polygon',
    80001: 'mumbai',
};

function getDeployConfig(chainId, releaseVersion) {
    return JSON.parse(readFileSync(`${RELEASES_PATH}/${releaseVersion}/${FOLDER_FOR_CHAIN[chainId]}/config/deploy.json`).toString());
}

function getReleaseOutputWriter(chainId, releaseVersion) {
    return new AsyncConf({ cwd: `${RELEASES_PATH}/${releaseVersion}/${FOLDER_FOR_CHAIN[chainId]}/output/`, configName: 'deployed' });
}

function getDeployment(chainId) {
    return JSON.parse(readFileSync(`${RELEASES_PATH}/deployments/${chainId}.json`).toString());
}

function getDeploymentOutputWriter(chainId) {
    return new AsyncConf({ cwd: `${RELEASES_PATH}/deployments/`, configName: `${chainId}` });
}

function setAddressesInParams(deployment, params) {
    return params.map((arg) => {
        if (arg.startsWith('deployment.')) {
            return deployment[arg.replace('deployment.', '')].address;
        } else {
            return arg;
        }
    });
}

module.exports = {
    saveImplementation,
    saveProposedImplementation,
    saveNonUpgradeable,
    getDeployConfig,
    getReleaseOutputWriter,
    getDeploymentOutputWriter,
    getDeployment,
    setAddressesInParams,
};
