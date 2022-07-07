const { ethers } = require('ethers');
const { deployAndConfig } = require('./deploy-config-local.js');
const fs = require('fs');
const DEBUG = require('debug')('forta:batch-reward-test');
const whitelist = require('./multi-whitelist-txs');
const utils = require('./utils');

const ownerForIndex = (accounts, index) => {
    const accountIndex = Math.floor(index / 10);
    return accounts[Math.min(accountIndex, accounts.length - 1)].address.toLowerCase();
};

const amountForIndex = (index) => {
    const amount = Math.max(1, index) * 100;
    return ethers.utils.parseEther(`${amount}`).toString();
};

const minStake = '500';

const generateTestRewardees = (accounts) => {
    if (fs.existsSync('./scripts/data/test-batch-rewards_rewardees.json')) {
        return require('./data/test-batch-rewards_rewardees.json');
    } else {
        const rewardees = new Array(102)
            .fill(1)
            .map(() => ethers.Wallet.createRandom().address.toLowerCase())
            .map((id, index) => {
                return { scanner: id, owner: ownerForIndex(accounts, index), amount: amountForIndex(index), status: 'NOT_SENT', epoch: 4, mode: 'TRANSFER_OWNER' };
            });
        console.log(rewardees);
        fs.writeFileSync('./scripts/data/test-batch-rewards_rewardees.json', JSON.stringify(rewardees));
        return rewardees;
    }
};

const FORTA_TOKEN_NAME = {
    4: 'Forta',
    5: 'Forta',
    80001: 'FortaBridgedPolygon',
    137: 'FortaBridgedPolygon',
};

const DEFENDER_RELAYER = {
    80001: process.env.MUMBAI_DEFENDER_RELAYER,
};

async function initializeWeb3(chainId) {
    let result;
    if (chainId === 31337) {
        const { accounts, contracts, deployer, provider } = await deployAndConfig({ stake: { min: minStake, max: '750', activated: true } });
        contracts.forta = contracts.token;
        result = { accounts, contracts, deployer, provider };
    } else {
        let configName;
        if (chainId === 5) {
            configName = chainId === 5 ? './_old/.cache-5-with-components' : `.cache-${chainId}`;
        } else {
            configName = `.cache-${chainId}`;
        }
        const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: configName });
        const provider = await utils.getDefaultProvider();
        const deployer = await utils.getDefaultDeployer(provider);
        const accounts = { admin: deployer };
        const contracts = await Promise.all(
            Object.entries({
                forta: utils.attach(FORTA_TOKEN_NAME[chainId], await CACHE.get('forta.address')).then((contract) => contract.connect(deployer)),
                relayer: utils.attach('BatchRelayer', await CACHE.get('batch-relayer.address')).then((contract) => contract.connect(deployer)),
                //agents: utils.attach('AgentRegistry',  await CACHE.get('agents.address')  ).then(contract => contract.connect(deployer)),
                scanners: utils.attach('ScannerRegistry', await CACHE.get('scanners.address')).then((contract) => contract.connect(deployer)),
                staking: utils.attach('FortaStaking', await CACHE.get('staking.address')).then((contract) => contract.connect(deployer)),
            }).map((entry) => Promise.all(entry))
        ).then(Object.fromEntries);
        result = { accounts, contracts, deployer, provider };
        if (!(await contracts.forta.hasRole(ethers.utils.id('WHITELIST_ROLE'), DEFENDER_RELAYER[chainId]))) {
            const tx = await contracts.forta.grantRole(ethers.utils.id('WHITELIST_ROLE'), DEFENDER_RELAYER[chainId]);
            await tx.wait();
        }
    }
    DEBUG(`Network:  ${chainId}`);
    DEBUG(`Deployer: ${result.deployer.address}`);
    DEBUG('----------------------------------------------------');
    return result;
}

async function main() {
    const provider = await utils.getDefaultProvider();
    const { chainId } = await provider.getNetwork();
    const { accounts, contracts, deployer } = await initializeWeb3(chainId);

    // Register scanners
    // eslint-disable-next-line no-unused-vars
    const rewardees = generateTestRewardees(accounts);

    await whitelist({ provider, deployer, contracts, toWhitelist: rewardees });

    /*
    await Promise.all(
        (await Promise.all(rewardees.map((rewardee, index) => contracts.scanners.adminRegister(rewardee.scanner, rewardee.owner, 1, `${index}`)))).map((tx) => tx.wait())
    );
    */

    // Stake on scanners
    // await Promise.all((await Promise.all(rewardees.map((rewardee) => contracts.staking.deposit(0, rewardee.scanner, ethers.utils.parseEther(minStake))))).map((tx) => tx.wait()));

    if (chainId === 31337) {
        const dev = {
            agents: contracts.agents.address,
            scanners: contracts.scanners.address,
            staking: contracts.staking.address,
            forta: contracts.forta.address,
            multisig: accounts[1].address,
            relayer: contracts.relayer.address,
        };
        DEBUG(dev);
        fs.writeFileSync('./scripts/data/hardhat-autotask-config.json', JSON.stringify(dev));
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
