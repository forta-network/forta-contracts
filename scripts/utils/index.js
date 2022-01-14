const { ethers, upgrades, network } = require('hardhat');
const { NonceManager     } = require('@ethersproject/experimental');
const Conf                 = require('conf');
const pLimit               = require('p-limit');

// override process.env with dotenv
Object.assign(process.env, require('dotenv').config().parsed);

const DEFAULT_FEE_DATA = {
    maxFeePerGas:         ethers.utils.parseUnits('100', 'gwei'),
    maxPriorityFeePerGas: ethers.utils.parseUnits('5',   'gwei'),
};

const getDefaultProvider = async (
    baseProvider = ethers.provider,
    feeData      = {},
) => {
    const provider  = new ethers.providers.FallbackProvider([ baseProvider ], 1);
    // provider.getFeeData = () => Promise.resolve(Object.assign(DEFAULT_FEE_DATA, feeData));
    return provider;
}

const getDefaultDeployer = async (
    provider,
    baseDeployer
) => {
    baseDeployer = baseDeployer ?? ethers.Wallet.fromMnemonic(
        process.env[`${network.name.toUpperCase()}_MNEMONIC`] ||
        'test test test test test test test test test test test junk'
    )
    const deployer = new NonceManager(baseDeployer).connect(provider);
    await deployer.getTransactionCount().then(nonce => deployer.setTransactionCount(nonce));
    deployer.address = await deployer.getAddress();
    return deployer;
}

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
        const value = await this.get(key) || await fallback();
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
    return (typeof factory === 'string' ? getFactory(factory) : Promise.resolve(factory))
    .then(contract => contract.attach(address));
}

function deploy(factory, params = []) {
    return (typeof factory === 'string' ? getFactory(factory) : Promise.resolve(factory))
    .then(contract => contract.deploy(...params))
    .then(f => f.deployed());
}

function deployUpgradeable(factory, kind, params = [], opts = {}) {
    return (typeof factory === 'string' ? getFactory(factory) : Promise.resolve(factory))
    .then(contract => upgrades.deployProxy(contract, params, { kind, ...opts }))
    .then(f => f.deployed());
}

function performUpgrade(proxy, factory, opts = {}) {
    return (typeof factory === 'string' ? getFactory(factory) : Promise.resolve(factory))
    .then(contract => upgrades.upgradeProxy(proxy.address, contract, opts));
}

function tryFetchContract(cache, key, contract, args = []) {
    return resumeOrDeploy(cache, key, () => contract.deploy(...args)).then(address => contract.attach(address));
}

function tryFetchProxy(cache, key, contract, kind = 'uups', args = [], opts = {}) {
    return resumeOrDeploy(cache, key, () => upgrades.deployProxy(contract, args, { kind, ...opts })).then(address => contract.attach(address));
}

async function resumeOrDeploy(cache, key, deploy) {
    let txHash  = await cache.get(`${key}-pending`);
    let address = await cache.get(key);

    if (!txHash && !address) {
        const contract = await deploy();
        txHash = contract.deployTransaction.hash;
        await cache.set(`${key}-pending`, txHash);
        await contract.deployed();
        address = contract.address;
        await cache.set(key, address);
    } else if (!address) {
        address = await ethers.provider.getTransaction(txHash)
        .then(tx => tx.wait())
        .then(receipt => receipt.contractAddress);
        await cache.set(key, address);
    }

    return address;
}

/*********************************************************************************************************************
 *                                                        Time                                                       *
 *********************************************************************************************************************/

function dateToTimestamp(...params) {
    return Math.floor((new Date(...params)).getTime() / 1000);
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
    dateToTimestamp,
    durationToSeconds,
};