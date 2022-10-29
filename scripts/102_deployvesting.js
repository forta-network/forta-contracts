const { ethers, upgrades } = require('hardhat');
const utils = require('./utils');
const loadEnv = require('./loadEnv');

upgrades.silenceWarnings();

const ROOT_TO_CHILD = {
    1: 137,
    5: 80001,
};

const L2ESCROWFACTORY = {
    80001: '0xd46832F3f8EA8bDEFe5316696c0364F01b31a573',
};

const L2ESCROWTEMPLATE = {
    80001: '0xe978c51Ef25F5825714c2532553286a9Dcf4c475',
};

async function main() {
    const { CACHE, contracts, roles, deployer, network, chainType } = await loadEnv();

    if (!(chainType & loadEnv.CHAIN_TYPE.ROOT)) {
        throw 'vesting should only be deployed on root chains';
    }

    const beneficiary = '0xF037353a9B47f453d89E9163F21a2f6e1000B07d';
    const allocation = ethers.utils.parseEther('100');
    const admin = deployer.address;
    const start = utils.dateToTimestamp('2021-09-01T00:00:00Z');
    const cliff = utils.durationToSeconds('1 year');
    const duration = utils.durationToSeconds('4 years');
    const RootChainManager = loadEnv.ROOT_CHAIN_MANAGER[network.chainId] ?? ethers.constants.AddressZero;
    const L2EscrowFactory = L2ESCROWFACTORY[ROOT_TO_CHILD[network.chainId]] ?? ethers.constants.AddressZero;
    const L2EscrowTemplate = L2ESCROWTEMPLATE[ROOT_TO_CHILD[network.chainId]] ?? ethers.constants.AddressZero;

    const vesting = await ethers.getContractFactory('VestingWalletV2', deployer).then((factory) =>
        utils.tryFetchProxy(CACHE, `vesting-${beneficiary}`, factory, 'uups', [beneficiary, admin, start, cliff, duration], {
            unsafeAllow: 'delegatecall',
            constructorArgs: [RootChainManager, L2EscrowFactory, L2EscrowTemplate],
        })
    );

    console.log(vesting.address);

    allocation.isZero() || (await contracts.token.mint(vesting.address, allocation).then((tx) => tx.wait()));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
