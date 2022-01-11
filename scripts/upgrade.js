const { ethers, upgrades } = require('hardhat');
const DEBUG                = require('debug')('forta');
const utils                = require('./utils');

//upgrades.silenceWarnings();

const upgradesCache = {

    "agents": {
        "0.1.1": {
            "contract": "AgentRegistry_0_1_1"
        },
        "0.1.2": {
            "contract": "AgentRegistry",
        }
    }
    
    
}

async function upgradeImpl(chainId, key, version, call = undefined, constructorArgs = [], unsafeAllow = []) {
    console.log(chainId, key, version)
    const allParams = upgradesCache[key][version]
    console.log(allParams)
    console.log(call)
    console.log(constructorArgs)
    console.log(unsafeAllow)

    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });
    console.log(key)
    const NewImplementation = await ethers.getContractFactory(allParams.contract);
    return upgrades.upgradeProxy(
        await CACHE.get(key),
        NewImplementation,
        {
            call: call,
            constructorArgs: constructorArgs,
            unsafeAllow: unsafeAllow
        }
    );

} 

async function main() {
    const provider = config?.provider ?? config?.deployer?.provider ?? await utils.getDefaultProvider();
    const deployer = config?.deployer ??                               await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });

    if (!provider.network.ensAddress) {
        provider.network.ensAddress = await CACHE.get('ens-registry');
    }

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`ENS:      ${provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG('----------------------------------------------------');
/*
    const contracts = await Promise.all(Object.entries({
        access:    utils.attach('AccessManager',   'access.forta.eth'             ).then(contract => contract.connect(deployer)),
        forwarder: utils.attach('Forwarder',       'forwarder.forta.eth'          ).then(contract => contract.connect(deployer)),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries);

    const roles = await Promise.all(Object.entries({

        REWARDS_ADMIN: ethers.utils.id('REWARDS_ADMIN_ROLE'), 
    }).map(entry => Promise.all(entry))).then(Object.fromEntries);

    // await contracts.access.grantRole(roles.UPGRADER,      deployer.address        ).then(tx => tx.wait());
   */
    //upgrade()
}
/*
main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
*/
module.exports = {
    upgradeImpl
}