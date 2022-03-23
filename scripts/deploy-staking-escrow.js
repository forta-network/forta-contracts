const { ethers, upgrades, network } = require('hardhat');
const DEBUG                = require('debug')('forta:migration');
const utils                = require('./utils');
const assert = require('assert');
const SCANNER_SUBJECT = 0;
const AGENT_SUBJECT = 1;
const semver = require('semver')

upgrades.silenceWarnings();

const CHILD_CHAIN_MANAGER_PROXY = {
    137:   '0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa',
    80001: '0xb5505a6d998549090530911180f38aC5130101c6',
};


async function main() {
    const provider = config?.provider ?? config?.deployer?.provider ?? await utils.getDefaultProvider();
    const deployer = config?.deployer ??                               await utils.getDefaultDeployer(provider);
    const { name, chainId } = await provider.getNetwork();
    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`ENS:      ${provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`Balance:  ${await provider.getBalance(deployer.address).then(ethers.utils.formatEther)}${ethers.constants.EtherSymbol}`);
    DEBUG('----------------------------------------------------');
    utils.assertNotUsingHardhatKeys(chainId, deployer);
    
    const CACHE_L2 = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });
    let CACHE_L1
    
    switch (chainId) {
        case 80001:
            CACHE_L1 = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${5}` });
            break;
        case 137:
            CACHE_L1 = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${1}` });
            break;
        default:
            throw new Error(`Unsupported chain ${chainId}`);

    }
    const manager = deployer.address;
    const l2EscrowFactory = await utils.attach('StakingEscrowFactory', await CACHE_L2.get('escrow-factory.address'));
    const l1Vesting = await CACHE_L1.get(`vesting-${manager}.address`)
    console.log(await l2EscrowFactory.newWallet(l1Vesting, manager))
    


}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;