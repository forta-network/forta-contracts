const { ethers, upgrades, network } = require('hardhat');
const DEBUG                = require('debug')('forta:migration');
const utils                = require('./utils');
const SCANNER_SUBJECT = 0;
const AGENT_SUBJECT = 1;
const semver = require('semver')

upgrades.silenceWarnings();

const CHILD_CHAIN_MANAGER_PROXY = {
    137:   '0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa',
    80001: '0xb5505a6d998549090530911180f38aC5130101c6',
};


/*********************************************************************************************************************
 *                                                Migration workflow                                                 *
 *********************************************************************************************************************/
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

    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });

    const contracts = {}


}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = migrate;