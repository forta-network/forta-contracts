const { kebabizeContractName, removeVersionFromContractName } = require('./stringUtils.js');
const loadRoles = require('./loadRoles');
const AsyncConf = require('./asyncConf');
const { readFileSync, existsSync } = require('fs');
const { getAddress } = require('@ethersproject/address');
const { ethers } = require('ethers');

const RELEASES_PATH = './releases';

async function saveImplementation(writer, contractName, constructorArgs, initArgs, implAddress, version) {
    const key = kebabizeContractName(contractName);
    await writer.set(`${key}.impl.address`, implAddress);
    await writer.set(`${key}.impl.constructor-args`, constructorArgs ?? []);
    await writer.set(`${key}.impl.init-args`, initArgs ?? []);
    await writer.set(`${key}.impl.name`, contractName);
    await writer.set(`${key}.impl.timeout`, 1200000);
    // await writer.set(`${key}.impl.verified`, false);
    await writer.set(`${key}.impl.version`, version);
}

async function saveNonUpgradeable(writer, contractName, constructorArgs, address, version) {
    const key = kebabizeContractName(contractName);
    await writer.set(`${key}.address`, address);
    await writer.set(`${key}.constructor-args`, constructorArgs);
    await writer.set(`${key}.name`, contractName);
    await writer.set(`${key}.version`, version);
    // await writer.set(`${key}.verified`, (await writer.get(`${key}.verified`)) ?? false);
}

async function saveToDeployment(releaseWriter, deploymentWriter, contractName) {
    const key = kebabizeContractName(contractName);
    await deploymentWriter.set(`${key}`, await releaseWriter.get(`${key}`));
    await deploymentWriter.set(`${key}-deploy-tx`, await releaseWriter.get(`${key}-deploy-tx`));
}

const CHAIN_NAME = {
    1: 'mainnet',
    5: 'goerli',
    137: 'polygon',
    80001: 'mumbai',
    31337: 'local',
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
    const path = `${RELEASES_PATH}/${releaseVersion}/${CHAIN_NAME[chainId]}/config/deploy.json`;
    console.log(path);
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

function getProposedAdminActions(chainId, releaseVersion) {
    validateInput(chainId, releaseVersion);
    const path = `${RELEASES_PATH}/${releaseVersion}/${CHAIN_NAME[chainId]}/config/propose-admin.json`;
    if (existsSync(path)) {
        return JSON.parse(readFileSync(path).toString());
    } else {
        return {};
    }
}

function getDeployReleaseWriter(chainId, releaseVersion) {
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

function parseAddress(info, key) {
    let address;
    if (key === 'relayer') {
        if (!info.relayer) {
            throw new Error('relayer object missing');
        }
        address = info.relayer;
    } else if (key === 'multisig') {
        if (!info.multisig) {
            throw new Error('multisig missing');
        }
        address = info.multisig;
    } else {
        if (!info.deployment) {
            throw new Error('deployment object missing');
        }
        if (!info.deployment[key]) throw new Error(`${key} does not exist in deployment`);
        address = info.deployment[key].address;
    }
    return getAddress(address);
}

function parseRole(info, role) {
    if (!info.roles) {
        throw new Error('roles object missing');
    }
    const roleKey = role.replace('_ROLE', '');
    if (!info.roles[roleKey]) {
        throw new Error(`Role not found: ${role}`);
    }
    const roleValue = ethers.utils.id(role);
    if (roleValue != info.roles[roleKey]) {
        throw new Error(`Role ${roleValue} and ${info.roles[roleKey]} does not match. Did you add _ROLE at the end?`);
    }
    return roleValue;
}

function formatParams(info, params) {
    return params.map((arg) => {
        switch (typeof arg) {
            case 'string':
                if (arg.startsWith('deployment.')) {
                    return parseAddress(info, removeVersionFromContractName(arg.replace('deployment.', '')));
                } else if (arg.startsWith('roles.')) {
                    return parseRole(info, arg.replace('roles.', ''));
                }
                return arg;
            case 'number':
                throw new Error(`Param ${arg} in ${params} should be a string`);
            default:
                if (arg === undefined) {
                    throw new Error(`Undefined arg in ${params}`);
                }
                return arg;
        }
    });
}

function getMultisigAddress(chainId) {
    const multisigs = JSON.parse(readFileSync(`${RELEASES_PATH}/deployments/multisigs.json`).toString());
    return getAddress(multisigs[CHAIN_NAME[chainId]]);
}

function getRelayerAddress(chainId) {
    const relayers = JSON.parse(readFileSync(`${RELEASES_PATH}/deployments/relayers.json`).toString());
    return getAddress(relayers[CHAIN_NAME[chainId]]);
}

function getDeploymentInfo(chainId) {
    return {
        deployment: getDeployment(chainId),
        roles: loadRoles(ethers),
        relayer: getRelayerAddress(chainId),
        multisig: getMultisigAddress(chainId),
    };
}

module.exports = {
    saveImplementation,
    saveNonUpgradeable,
    getDeployConfig,
    deployConfigExists,
    getUpgradesConfig,
    getProposedAdminActions,
    upgradeConfigExists,
    getDeployReleaseWriter,
    getDeploymentOutputWriter,
    getUpgradeOutputwriter,
    getDeployment,
    getDeployed,
    getDeployedImplementations,
    formatParams,
    getMultisigAddress,
    parseAddress,
    saveToDeployment,
    getRelayerAddress,
    getDeploymentInfo
};
