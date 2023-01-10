const hre = require('hardhat');
const { network, ethers } = hre;
const chalk = require('chalk');
const assert = require('assert');
const { NonceManager } = require('@ethersproject/experimental');
const { Manifest } = require('@openzeppelin/upgrades-core');
const { deploy, getProxyFactory } = require('@openzeppelin/hardhat-upgrades/dist/utils');

const revert = (msg = 'Error') => {
    throw new Error(msg);
};

/*********************************************************************************************************************
 *                                                  Async safe Conf                                                  *
 *********************************************************************************************************************/
const Conf = require('conf');
const pLimit = require('p-limit');

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
 *                                                    Conversion                                                     *
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

/*********************************************************************************************************************
 *                                                Blockchain helpers                                                 *
 *********************************************************************************************************************/
async function resumeOrDeploy(cache, key, deploy) {
    let txHash = await cache.get(`${key}-deploy-tx`);
    let address = await cache.get(key);

    if (!txHash && !address) {
        const contract = await deploy();
        txHash = contract.deployTransaction.hash;
        await cache.set(`${key}-deploy-tx`, txHash);
        contract.deployed && (await contract.deployed());
        contract.wait && (await contract.wait());
        address = contract.address;
        await cache.set(key, address);
    } else if (!address) {
        address = await ethers.provider
            .getTransaction(txHash)
            .then((tx) => tx.wait())
            .then((receipt) => receipt.contractAddress);
        await cache.set(key, address);
    }

    return address;
}

async function main() {
    const TXLimiter = pLimit(4); // maximum 4 simulatenous transactions
    const CONFIG = require('./CONFIG.js');

    // wrap provider to re-enable maxpriorityfee mechanism
    const provider = new ethers.providers.FallbackProvider([ethers.provider], 1);
    // create new wallet on top of the wrapped provider
    const deployer = new NonceManager(
        ethers.Wallet.fromMnemonic(process.env[`${network.name.toUpperCase()}_MNEMONIC`] || 'test test test test test test test test test test test junk')
    ).connect(provider);

    deployer.address = await deployer.getAddress();
    const { name, chainId } = await deployer.provider.getNetwork();

    ethers.provider.network.ensAddress = ethers.provider.network.ensAddress || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';

    console.log(`Network:  ${name} (${chainId})`);
    console.log(`Deployer: ${deployer.address}`);
    console.log('----------------------------------------------------');

    // Preparing cache and transaction limiter
    const CACHE = new AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });

    const kind = 'uups';
    const impl = { 1: '0xF5E4f8e6F4eD07c2854a315332B883Dac49b2575' }[chainId] || revert(`VestingWallet implementation not yet deployed to ${name}-${chainId}`);
    const { interface } = await ethers.getContractFactory('VestingWallet', deployer);
    const proxyFactory = await getProxyFactory(hre, deployer);
    const manifest = new Manifest(chainId);

    console.log(chalk.bold('[1/2] Deploy vesting wallets...'));
    const vesting = await Promise.all(
        CONFIG.allocations
            .filter(({ type }) => type == 'vesting')
            .map((allocation, i, allocations) =>
                TXLimiter(() => {
                    const beneficiary = allocation.beneficiary;
                    const admin = allocation.upgrader;
                    const start = dateToTimestamp(allocation.start);
                    const cliff = durationToSeconds(allocation.cliff);
                    const duration = durationToSeconds(allocation.duration);

                    return resumeOrDeploy(CACHE, `vesting-${allocation.beneficiary}`, () =>
                        deploy(proxyFactory, impl, interface.encodeFunctionData('initialize', [beneficiary, admin, start, cliff, duration]))
                            .then((proxyDeployment) => Object.assign(proxyDeployment, { kind }))
                            .then((proxyDeployment) => manifest.addProxy(proxyDeployment).then(() => proxyDeployment))
                    ).then((address) => {
                        console.log(`- VestingWallet #${i + 1}/${allocations.length} for ${allocation.beneficiary} deployed to ${address}`);
                        return [allocation.beneficiary, new ethers.Contract(address, interface, provider)];
                    });
                })
            )
    ).then(Object.fromEntries);
    console.log(chalk.bold('[1/2] done.'));

    console.log(chalk.bold('[2/2] Post deployment checks...'));
    // vesting config
    await Promise.all(
        CONFIG.allocations
            .filter(({ type }) => type == 'vesting')
            // eslint-disable-next-line no-unused-vars
            .map(async (allocation, i, allocations) => {
                const contract = vesting[allocation.beneficiary];
                await Promise.all([contract.start(), contract.cliff(), contract.duration(), contract.beneficiary(), contract.owner()]).then(
                    ([start, cliff, duration, beneficiary, owner]) => {
                        assert(start.eq(dateToTimestamp(allocation.start)), `Wrong start for vested allocation to ${allocation.beneficiary}`);
                        assert(cliff.eq(durationToSeconds(allocation.cliff)), `Wrong cliff for vested allocation to ${allocation.beneficiary}`);
                        assert(duration.eq(durationToSeconds(allocation.duration)), `Wrong duration for vested allocation to ${allocation.beneficiary}`);
                        assert.strictEqual(beneficiary.toLowerCase(), allocation.beneficiary.toLowerCase(), `Wrong beneficiary for vested allocation to ${allocation.beneficiary}`);
                        assert.strictEqual(owner.toLowerCase(), allocation.upgrader.toLowerCase(), `Wrong admin for direct allocation to ${allocation.beneficiary}`);
                    }
                );
            })
    );
    console.log(chalk.bold('[2/2] done.'));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
