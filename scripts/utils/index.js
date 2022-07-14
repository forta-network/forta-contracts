const { ethers, upgrades, network } = require('hardhat');
const { NonceManager } = require('@ethersproject/experimental');
const Conf = require('conf');
const pLimit = require('p-limit');
const DEBUG = require('debug')('forta:utils');
const assert = require('assert');

// override process.env with dotenv
Object.assign(process.env, require('dotenv').config().parsed);

const DEFAULT_FEE_DATA = {
    maxFeePerGas: ethers.utils.parseUnits('300', 'gwei'),
    maxPriorityFeePerGas: ethers.utils.parseUnits('30', 'gwei'),
};

const getDefaultProvider = async (baseProvider = ethers.provider, feeData = {}) => {
    const provider = new ethers.providers.FallbackProvider([baseProvider], 1);
    //provider.getFeeData = () => Promise.resolve(Object.assign(DEFAULT_FEE_DATA, feeData));
    return provider;
};

const getDefaultDeployer = async (provider, baseDeployer) => {
    baseDeployer =
        baseDeployer ?? ethers.Wallet.fromMnemonic(process.env[`${network.name.toUpperCase()}_MNEMONIC`] || 'test test test test test test test test test test test junk');
    const deployer = new NonceManager(baseDeployer).connect(provider);
    await deployer.getTransactionCount().then((nonce) => deployer.setTransactionCount(nonce));
    deployer.address = await deployer.getAddress();
    return deployer;
};

/*********************************************************************************************************************
 *                                                  Async safe Conf                                                  *
 *********************************************************************************************************************/
class AsyncConf extends Conf {
    constructor(conf) {
        super(conf);
        this.limit = pLimit(1);
    }

    get(key) {
        return this.limit(() => super.get(key));
    }

    set(key, value) {
        return this.limit(() => super.set(key, value));
    }

    async getFallback(key, fallback) {
        const value = (await this.get(key)) || (await fallback());
        await this.set(key, value);
        return value;
    }

    async expect(key, value) {
        const fromCache = await this.get(key);
        if (fromCache) {
            assert.deepStrictEqual(value, fromCache);
            return false;
        } else {
            await this.set(key, value);
            return true;
        }
    }
}

/*********************************************************************************************************************
 *                                                Blockchain helpers                                                 *
 *********************************************************************************************************************/

function getFactory(name) {
    return ethers.getContractFactory(name);
}

function attach(factory, address) {
    return (typeof factory === 'string' ? getFactory(factory) : Promise.resolve(factory)).then((contract) => contract.attach(address));
}

function deploy(factory, params = []) {
    return (typeof factory === 'string' ? getFactory(factory) : Promise.resolve(factory)).then((contract) => contract.deploy(...params)).then((f) => f.deployed());
}

function deployUpgradeable(factory, kind, params = [], opts = {}) {
    return (typeof factory === 'string' ? getFactory(factory) : Promise.resolve(factory))
        .then((contract) => upgrades.deployProxy(contract, params, { kind, ...opts }))
        .then((f) => f.deployed());
}

async function performUpgrade(proxy, factory, opts = {}, cache, key) {
    const contract = typeof factory === 'string' ? await getFactory(factory) : factory;
    const afterUpgradeContract = await upgrades.upgradeProxy(proxy.address, contract, opts);
    if (cache) await saveImplementationParams(cache, key, opts, afterUpgradeContract);
    return afterUpgradeContract;
}

// eslint-disable-next-line no-unused-vars
async function tryFetchContract(cache, key, contract, args = [], opts = {}) {
    const deployed = await resumeOrDeploy(cache, key, () => contract.deploy(...args)).then((address) => contract.attach(address));
    DEBUG(`${key}.args`, args);
    await cache.set(`${key}.args`, args);
    await saveVersion(key, cache, deployed, false);
    return deployed;
}

async function migrateAddress(cache, key) {
    let legacyAddress = await cache.get(key);
    if (legacyAddress && typeof legacyAddress === 'string' && legacyAddress.startsWith('0x')) {
        await cache.set(`${key}.address`, legacyAddress);
        return legacyAddress;
    } else {
        return await cache.get(`${key}.address`);
    }
}

async function tryFetchProxy(cache, key, contract, kind = 'uups', args = [], opts = {}) {
    const deployed = await resumeOrDeploy(cache, key, () => upgrades.deployProxy(contract, args, { kind, ...opts })).then((address) => contract.attach(address));
    if (cache) await saveImplementationParams(cache, key, opts, deployed);
    return deployed;
}

async function saveImplementationParams(cache, key, opts, contract) {
    const implAddress = await upgrades.erc1967.getImplementationAddress(contract.address);
    await cache.set(`${key}.impl.args`, opts.constructorArgs ?? []);
    await cache.set(`${key}.impl.address`, implAddress);
    await saveVersion(key, cache, contract, true);
}

async function getContractVersion(contract, deployParams = {}) {
    if (contract) {
        try {
            return contract['version'] ? await contract.version() : '0.0.0';
        } catch (e) {
            // Version not introduced in deployed contract yet
            return '0.0.0';
        }
    } else if (deployParams.address && deployParams.provider) {
        try {
            const abi = `{"inputs": [],"name": "version","outputs": [{"internalType": "string","name": "","type": "string"}],"stateMutability": "view","type": "function"}`;
            const versioned = new ethers.Contract(deployParams.address, abi, deployParams.provider);
            return await versioned.version();
        } catch (e) {
            // Version not introduced in source code yet
            return '0.0.0';
        }
    }
    throw new Error('Cannot get contract version. Provide contract object or deployParams');
}

async function saveVersion(key, cache, contract, isProxy) {
    const impl = isProxy ? '.impl' : '';
    const version = await getContractVersion(contract);
    DEBUG(`${key}${impl}.version`, version);
    await cache.set(`${key}${impl}.version`, version);
}

async function resumeOrDeploy(cache, key, deploy) {
    let txHash = await cache.get(`${key}-pending`);
    let address = await migrateAddress(cache, key);
    DEBUG('resumeOrDeploy', key, txHash, address);

    if (!txHash && !address) {
        const contract = await deploy();
        txHash = contract.deployTransaction.hash;
        await cache.set(`${key}-pending`, txHash);
        await contract.deployed();
        address = contract.address;
    } else if (!address) {
        address = await ethers.provider
            .getTransaction(txHash)
            .then((tx) => tx.wait())
            .then((receipt) => receipt.contractAddress);
    }
    await cache.set(`${key}.address`, address);
    return address;
}

async function getEventsFromContractCreation(cache, key, eventName, contract, filterParams = []) {
    let txHash = await cache.get(`${key}-pending`);
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

const assertNotUsingHardhatKeys = (chainId, deployer) => {
    if (chainId !== 31337 && deployer.address === '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266') {
        DEBUG(deployer.address, chainId);

        throw new Error('using hardhat key for other network');
    }
};

/*********************************************************************************************************************
 *                                                        Arrays                                                     *
 *********************************************************************************************************************/
Array.range = function (start, stop = undefined, step = 1) {
    if (!stop) {
        stop = start;
        start = 0;
    }
    return start < stop
        ? Array(Math.ceil((stop - start) / step))
              .fill()
              .map((_, i) => start + i * step)
        : [];
};

Array.prototype.chunk = function (size) {
    return Array.range(Math.ceil(this.length / size)).map((i) => this.slice(i * size, i * size + size));
};
/*********************************************************************************************************************
 *                                                        Strings                                                       *
 *********************************************************************************************************************/

const kebabize = (str) => {
    return str
        .split('')
        .map((letter, idx) => {
            return letter.toUpperCase() === letter ? `${idx !== 0 ? '-' : ''}${letter.toLowerCase()}` : letter;
        })
        .join('');
};

const camelize = (s) => s.replace(/-./g, (x) => x[1].toUpperCase());
const upperCaseFirst = (s) => s.replace(/^[a-z,A-Z]/, (x) => x[0].toUpperCase());

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
    AsyncConf,
    getDefaultProvider,
    getDefaultDeployer,
    getFactory,
    attach,
    deploy,
    deployUpgradeable,
    performUpgrade,
    tryFetchContract,
    tryFetchProxy,
    migrateAddress,
    dateToTimestamp,
    durationToSeconds,
    getContractVersion,
    getEventsFromTx,
    getEventsFromContractCreation,
    assertNotUsingHardhatKeys,
    kebabize,
    camelize,
    upperCaseFirst,
};
