/* eslint-disable no-case-declarations */
/* eslint-disable no-fallthrough */
const { ethers, upgrades, network } = require('hardhat');
const chalk = require('chalk');
const assert = require('assert');
const { NonceManager } = require('@ethersproject/experimental');

/*********************************************************************************************************************
 *                                                  Array utilities                                                  *
 *********************************************************************************************************************/
Array.range = function (n) {
    return Array(n)
        .fill()
        .map((_, i) => i);
};

Array.prototype.unique = function (op = (x) => x) {
    return this.filter((obj, i) => this.findIndex((entry) => op(obj) === op(entry)) === i);
};

Array.prototype.chunk = function (size) {
    return Array.range(Math.ceil(this.length / size)).map((i) => this.slice(i * size, i * size + size));
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
function tryFetchContract(cache, key, contract, args = []) {
    return resumeOrDeploy(cache, key, () => contract.deploy(...args)).then((address) => contract.attach(address));
}

function tryFetchProxy(cache, key, contract, args = [], kind = 'uups') {
    return resumeOrDeploy(cache, key, () => upgrades.deployProxy(contract, args, { kind, unsafeAllow: 'delegatecall' })).then((address) => contract.attach(address));
}

async function resumeOrDeploy(cache, key, deploy) {
    let txHash = await cache.get(`${key}-deploy-tx`);
    let address = await cache.get(key);

    if (!txHash && !address) {
        const contract = await deploy();
        txHash = contract.deployTransaction.hash;
        await cache.set(`${key}-deploy-tx`, txHash);
        await contract.deployed();
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

const TXLimiter = pLimit(4); // maximum 4 simulatenous transactions

async function executeInBatchAndWait({ target, relayer, batchsize = 16 }, calldatas) {
    return Promise.all(calldatas)
        .then((calldatas) =>
            calldatas // take all subcalls ...
                .filter(Boolean) // ... filter out the empty calls ...
                .chunk(batchsize) // ... divide calls in chunks ...
                .map(
                    (
                        batch,
                        i,
                        batches // ... for each chunk ...
                    ) =>
                        TXLimiter(async () => {
                            // ... with limited parallelism ...
                            console.log(`- batch #${i + 1}/${batches.length} submitted with ${batch.length} operation(s)`);
                            const tx = await relayer.relay(target, batch); // ... run the chunk through the relayer
                            const receipt = await tx.wait(); // ... wait for the tx to be mined ...
                            console.log(`- batch #${i + 1}/${batches.length} mined: ${receipt.transactionHash} (block #${receipt.blockNumber})`);
                            return receipt; // ... and return the tx receipt
                        })
                )
        )
        .then((promises) => Promise.all(promises)); // wait for all receipts to be available
}

function grantRole(contract, role, account) {
    return contract.hasRole(role, account).then((hasRole) => (hasRole ? null : contract.interface.encodeFunctionData('grantRole', [role, account])));
}

function renounceRole(contract, role, account) {
    return contract.hasRole(role, account).then((hasRole) => (hasRole ? contract.interface.encodeFunctionData('renounceRole', [role, account]) : null));
}

function mint(contract, account, amount) {
    return contract.balanceOf(account).then((balance) => (balance.isZero() ? contract.interface.encodeFunctionData('mint', [account, amount]) : null));
}

async function main() {
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

    // Loading contract artefacts
    const Forta = await ethers.getContractFactory('Forta', deployer);
    const VestingWallet = await ethers.getContractFactory('VestingWallet', deployer);
    const BatchRelayer = await ethers.getContractFactory('BatchRelayer', deployer);

    // Preparing cache and transaction limiter
    const CACHE = new AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });

    /*******************************************************************************************************************
     *                                                  Sanity check                                                   *
     *******************************************************************************************************************/
    console.log(chalk.bold('[0/8] Config sanity check...'));
    let step;
    try {
        step = 'at least one admin is required';
        assert(CONFIG.admins.length);

        step = 'invalid addresses in the admins';
        CONFIG.admins = await Promise.all(CONFIG.admins.map(ethers.provider.resolveName));
        assert(CONFIG.admins.every(ethers.utils.isAddress));

        step = 'invalid addresses in the minters';
        CONFIG.minters = await Promise.all(CONFIG.minters.map(ethers.provider.resolveName));
        assert(CONFIG.minters.every(ethers.utils.isAddress));

        step = 'invalid addresses in the whitelisters';
        CONFIG.whitelisters = await Promise.all(CONFIG.whitelisters.map(ethers.provider.resolveName));
        assert(CONFIG.whitelisters.every(ethers.utils.isAddress));

        step = 'invalid addresses in the beneficiaries';
        await Promise.all(CONFIG.allocations.map(async (allocation) => Object.assign(allocation, { beneficiary: await ethers.provider.resolveName(allocation.beneficiary) })));
        assert(CONFIG.allocations.every(({ beneficiary }) => ethers.utils.isAddress(beneficiary)));

        step = 'invalid upgrader address';
        await Promise.all(
            CONFIG.allocations.map(async (allocation) =>
                Object.assign(allocation, { upgrader: await ethers.provider.resolveName(allocation.upgrader || ethers.constants.AddressZero) })
            )
        );
        assert(CONFIG.allocations.every(({ upgrader }) => ethers.utils.isAddress(upgrader)));

        step = 'invalid allocation amount';
        assert(CONFIG.allocations.every(({ amount }) => ethers.BigNumber.from(amount)));

        step = 'invalid allocation type';
        assert(CONFIG.allocations.every(({ type }) => ['direct', 'vesting'].includes(type)));

        step = 'invalid allocation start';
        assert(CONFIG.allocations.every(({ type, start }) => type !== 'vesting' || dateToTimestamp(start)));

        step = 'invalid allocation cliff';
        assert(CONFIG.allocations.every(({ type, cliff }) => type !== 'vesting' || durationToSeconds(cliff)));

        step = 'invalid allocation duration';
        assert(CONFIG.allocations.every(({ type, duration }) => type !== 'vesting' || durationToSeconds(duration)));

        step = 'beneficiary receives multiple allocations of the same type';
        assert(CONFIG.allocations.map(({ type, beneficiary }) => [type, beneficiary.toLocaleLowerCase()].join()).every((key, i, array) => array.indexOf(key) === i));
    } catch (_) {
        console.error(`Error unsafe configuration: ${step}`);
        console.error(_);
        process.exit(1);
    }
    console.log(chalk.bold('[0/8] done.'));

    await CACHE.expect('deployer', deployer.address);
    await CACHE.expect('CONFIG', JSON.stringify(CONFIG));

    /*******************************************************************************************************************
     *                                                 Deploy relayer                                                  *
     *******************************************************************************************************************/
    console.log(chalk.bold('[1/8] Deploy relayer...'));
    const relayer = await tryFetchContract(CACHE, 'relayer', BatchRelayer);
    console.log(`- Relayer address: ${relayer.address}`);
    console.log(chalk.bold('[1/8] done.'));

    /*******************************************************************************************************************
     *                                                  Deploy token                                                   *
     *******************************************************************************************************************/
    console.log(chalk.bold('[2/8] Deploy token...'));
    const forta = await tryFetchProxy(CACHE, 'forta', Forta, [relayer.address], 'uups');
    console.log(`- Forta address: ${forta.address}`);
    console.log(chalk.bold('[2/8] done.'));

    const ADMIN_ROLE = await forta.ADMIN_ROLE();
    const MINTER_ROLE = await forta.MINTER_ROLE();
    const WHITELISTER_ROLE = await forta.WHITELISTER_ROLE();
    const WHITELIST_ROLE = await forta.WHITELIST_ROLE();

    /*******************************************************************************************************************
     *                                             Deploy vesting wallets                                              *
     *******************************************************************************************************************/
    console.log(chalk.bold('[3/8] Deploy vesting wallets...'));

    // TODO: prepareImpl to deploy VestingWallet before the proxies

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

                    return tryFetchProxy(CACHE, `vesting-${allocation.beneficiary}`, VestingWallet, [beneficiary, admin, start, cliff, duration], 'uups').then((result) => {
                        console.log(`- VestingWallet #${i + 1}/${allocations.length} for ${allocation.beneficiary} deployed to ${result.address}`);
                        return [allocation.beneficiary, result];
                    });
                })
            )
    ).then(Object.fromEntries);
    console.log(chalk.bold('[3/8] done.'));

    /*****************************************************************************************************************
     *                                 Everything is deployed, lets rock and roll !                                  *
     *****************************************************************************************************************/
    switch ((await CACHE.get('step')) || 4) {
        // Setup relayer permissions
        case 4:
            assert(await forta.hasRole(ADMIN_ROLE, relayer.address), `Deployer is missing the ADMIN role, which is needed to set permissions`);

            console.log(chalk.bold('[4/8] Setup relayer permissions...'));
            await executeInBatchAndWait({ target: forta.address, relayer }, [grantRole(forta, MINTER_ROLE, relayer.address), grantRole(forta, WHITELISTER_ROLE, relayer.address)]);
            console.log(chalk.bold('[4/8] done.'));
            await CACHE.set('step', 5);
        // Grant role
        case 5:
            assert(await forta.hasRole(WHITELISTER_ROLE, relayer.address), `Deployer is missing the WHITELISTER role, which is needed to set permissions`);

            console.log(chalk.bold('[5/8] Setup roles...'));
            await executeInBatchAndWait({ target: forta.address, relayer }, [
                // whitelist all beneficiary
                ...CONFIG.allocations
                    .map(({ beneficiary }) => beneficiary)
                    .unique()
                    .map((address) => grantRole(forta, WHITELIST_ROLE, address)),
                // whitelist all vesting wallets
                ...Object.values(vesting).map(({ address }) => grantRole(forta, WHITELIST_ROLE, address)),
            ]);
            console.log(chalk.bold('[5/8] done.'));
            await CACHE.set('step', 6);

        // Mint vested tokens
        case 6:
            assert(await forta.hasRole(MINTER_ROLE, relayer.address), `Deployer is missing the MINTER_ROLE role, which is needed to set mint allocations`);

            console.log(chalk.bold('[6/8] Mint vested allocations...'));
            await executeInBatchAndWait({ target: forta.address, relayer }, [
                ...CONFIG.allocations.filter(({ type }) => type == 'direct').map((allocation) => mint(forta, allocation.beneficiary, allocation.amount)),
                ...CONFIG.allocations.filter(({ type }) => type == 'vesting').map((allocation) => mint(forta, vesting[allocation.beneficiary].address, allocation.amount)),
            ]);
            console.log(chalk.bold('[6/8] done.'));
            await CACHE.set('step', 7);

        // Cleanup relayer permissions
        case 7:
            console.log(chalk.bold('[7/8] Cleanup relayer permissions...'));
            await executeInBatchAndWait({ target: forta.address, relayer }, [
                renounceRole(forta, MINTER_ROLE, relayer.address),
                renounceRole(forta, WHITELISTER_ROLE, relayer.address),
            ]);
            console.log(chalk.bold('[7/8] done.'));
            await CACHE.set('step', 8);
    }

    /*******************************************************************************************************************
     *                                             Post deployment checks                                              *
     *******************************************************************************************************************/
    console.log(chalk.bold('[8/8] Post deployment checks...'));
    // permissions
    assert(
        Promise.all(
            [
                { role: ADMIN_ROLE, address: deployer.address, value: false },
                { role: ADMIN_ROLE, address: relayer.address, value: false },
                { role: MINTER_ROLE, address: deployer.address, value: false },
                { role: MINTER_ROLE, address: relayer.address, value: false },
                { role: WHITELISTER_ROLE, address: deployer.address, value: false },
                { role: WHITELISTER_ROLE, address: relayer.address, value: false },
                ...CONFIG.admins.map((address) => ({ role: ADMIN_ROLE, address, value: true })),
                ...CONFIG.minters.map((address) => ({ role: MINTER_ROLE, address, value: true })),
                ...CONFIG.whitelisters.map((address) => ({ role: WHITELISTER_ROLE, address, value: true })),
                ...CONFIG.allocations.map((allocation) => ({ role: MINTER_ROLE, address: allocation.beneficiary, value: true })),
                ...Object.values(vesting).map((vesting) => ({ role: MINTER_ROLE, address: vesting.address, value: true })),
            ].map(({ role, address, value }) => forta.hasRole(role, address).then((result) => result === value))
        ).then((results) => results.every(Boolean))
    );

    // vesting config
    await Promise.all(
        // eslint-disable-next-line no-unused-vars
        CONFIG.allocations.map(async (allocation, i, allocations) => {
            switch (allocation.type) {
                case 'direct':
                    await Promise.all([forta.balanceOf(allocation.beneficiary)]).then(([balance]) => {
                        assert(balance.eq(allocation.amount), `Wrong balance for direct allocation to ${allocation.beneficiary}`);
                    });
                    break;

                case 'vesting':
                    const contract = vesting[allocation.beneficiary];
                    await Promise.all([forta.balanceOf(contract.address), contract.start(), contract.cliff(), contract.duration(), contract.beneficiary(), contract.owner()]).then(
                        ([balance, start, cliff, duration, beneficiary, owner]) => {
                            assert(balance.eq(allocation.amount), `Wrong balance for vested allocation to ${allocation.beneficiary}`);
                            assert(start.eq(dateToTimestamp(allocation.start)), `Wrong start for vested allocation to ${allocation.beneficiary}`);
                            assert(cliff.eq(durationToSeconds(allocation.cliff)), `Wrong cliff for vested allocation to ${allocation.beneficiary}`);
                            assert(duration.eq(durationToSeconds(allocation.duration)), `Wrong duration for vested allocation to ${allocation.beneficiary}`);
                            assert.strictEqual(beneficiary, allocation.beneficiary, `Wrong beneficiary for vested allocation to ${allocation.beneficiary}`);
                            assert.strictEqual(owner, allocation.upgrader, `Wrong admin for direct allocation to ${allocation.beneficiary}`);
                        }
                    );
                    break;
            }
        })
    );
    console.log(chalk.bold('[8/8] done.'));

    console.log('----------------------------------------------------');
    console.log(`Total supply: ${await forta.totalSupply().then(ethers.utils.formatEther)} ${await forta.symbol()}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
