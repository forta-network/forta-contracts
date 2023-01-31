const DEBUG = require('debug')('forta:utils');
const EthDater = require('block-by-date-ethers');
const process = require('process');
// const contractHelpers = require('./contractHelpers');
require('./arrays');
const chainsMini = require('./chainsMini.json');

// override process.env with dotenv
Object.assign(process.env, require('dotenv').config().parsed);

async function getEventsFromContractCreation(cache, key, eventName, contract, filterParams = []) {
    let txHash = await cache.get(`${key}-deploy-tx`);
    if (!txHash) {
        throw new Error(`${key} deployment transaction not saved`);
    }
    return getEventsFromTx(txHash, eventName, contract, filterParams);
}

async function getEventsFromTx(txHash, eventName, contract, filterParams = [], aProvider) {
    let provider = aProvider ?? contract.provider ?? contract.signer.provider;
    const receipt = await provider.getTransactionReceipt(txHash);
    if (receipt === null) {
        return [];
    }
    const filters = contract.filters[eventName](...filterParams);
    return contract.queryFilter(filters, receipt.blockNumber, 'latest');
}

async function getLogsForBlockInterval(initialBlock, endBlock, contract, filters) {
    let logs = {};
    const blockInterval = 8000;
    for (let i = initialBlock.block; i <= endBlock.block; i += blockInterval) {
        const fromBlock = i;
        const toBlock = Math.min(endBlock.block, i + blockInterval);
        DEBUG(fromBlock, '-', toBlock);
        const filterNames = Object.keys(filters);
        for (let filterName of filterNames) {
            const result = await contract.queryFilter(filters[filterName], fromBlock, toBlock);
            logs[filterName] = [...(logs[filterName] ?? []), ...result];
        }
    }
    return logs;
}

async function getEventsForTimeInterval(provider, initialDate, endDate, contract, filters) {
    const dater = new EthDater(provider);
    const initialBlock = await dater.getDate(initialDate, true);
    DEBUG(initialBlock);
    const endBlock = await dater.getDate(endDate, true);
    DEBUG(endBlock);

    return getLogsForBlockInterval(initialBlock, endBlock, contract, filters);
}

const assertNotUsingHardhatKeys = (chainId, deployer) => {
    if (chainId !== 31337 && deployer.address === '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266') {
        DEBUG(deployer.address, chainId);

        throw new Error('using hardhat key for other network');
    }
};

function toEIP3770(chainId, address) {
    const network = chainsMini.find((c) => c.chainId === chainId);
    if (!network) throw new Error(`Network ${chainId} not found`);
    return `${network.shortName}:${address}`;
}

function networkName(chainId) {
    return chainsMini.find((c) => c.chainId === chainId)?.name;
}

/*********************************************************************************************************************
 *                                                        Time                                                       *
 *********************************************************************************************************************/

function dateToTimestamp(...params) {
    return Math.floor(new Date(...params).getTime() / 1000);
}

function durationToSeconds(duration) {
    const durationPattern = /^(\d+) +(second|minute|hour|day|week|month|year)s?$/;
    const match = duration.match(durationPattern);

    if (!match) {
        throw new Error(`Bad duration format (${durationPattern.source})`);
    }

    const second = 1;
    const minute = 60 * second;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    const month = 30 * day;
    const year = 365 * day;
    const seconds = { second, minute, hour, day, week, month, year };

    const value = parseFloat(match[1]);
    return value * seconds[match[2]];
}

module.exports = {
    /*
    getDefaultProvider: (baseProvider, feeData) => contractHelpers.getDefaultProvider(hre, baseProvider, feeData),
    getDefaultDeployer: (provider, baseDeployer, network) => contractHelpers.getDefaultDeployer(hre, provider, baseDeployer, network),
    getFactory: (name) => contractHelpers.getFactory(hre, name),
    attach: (factory, address) => contractHelpers.attach(hre, factory, address),
    deploy: (factory, params) => contractHelpers.deploy(hre, factory, params),
    deployUpgradeable: (factory, kind, params, opts) => contractHelpers.deployUpgradeable(hre, factory, kind, params, opts),
    performUpgrade: (proxy, contractName, opts) => contractHelpers.performUpgrade(hre, proxy, contractName, opts),
    proposeUpgrade: (contractName, opts, cache) => contractHelpers.proposeUpgrade(hre, contractName, opts, cache),
    tryFetchContract: (contractName, args, cache) => contractHelpers.tryFetchContract(hre, contractName, args, cache),
    tryFetchProxy: (contractName, kind, args, opts, cache) => contractHelpers.tryFetchProxy(hre, contractName, kind, args, opts, cache),
    getContractVersion: (contract, deployParams) => contractHelpers.getContractVersion(hre, contract, deployParams),
    getBlockExplorerDomain: () => contractHelpers.getBlockExplorerDomain(hre),
    */
    dateToTimestamp,
    durationToSeconds,
    getEventsFromTx,
    getEventsFromContractCreation,
    getEventsForTimeInterval,
    getLogsForBlockInterval,
    assertNotUsingHardhatKeys,
    toEIP3770,
    networkName,
};
