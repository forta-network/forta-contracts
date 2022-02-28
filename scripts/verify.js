const { ethers } = require('hardhat');
const DEBUG                = require('debug')('forta:verify');
const utils                = require('./utils');

async function verify(config = {}) {
    const provider = config?.provider ?? config?.deployer?.provider ?? await utils.getDefaultProvider();
    const deployer = config?.deployer ??                               await utils.getDefaultDeployer(provider);
    
    const { name, chainId } = await provider.getNetwork();
    const CACHE    = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });
    const contractKeys = await CACHE.get('contracts');
    for (key of contractKeys) {
        if ((await CACHE.get(`${key}.verified`)) === 'true') {
            continue;
        }
        DEBUG('-------------------------------------------------');

        DEBUG(`Verifying ${key}`);
        let address, args;
        if (await CACHE.has(`${key}.impl`)) {
            DEBUG(`implementation:`);
            const impl = await CACHE.get(`${key}.impl`);
            address = impl.address;
            args = impl.args;
        } else {
            DEBUG(`contract:`);
            address = await CACHE.get(`${key}.address`);
            args = await CACHE.get(`${key}.args`);
        }
        if (!address || !args) {
            console.log(`skipping ${key}, malformed cache json`);
        }
        DEBUG(`address:`, address);
        DEBUG(`constructorArguments:`, args);
        try {
            await hre.run("verify:verify", {
                address: address,
                constructorArguments: args,
            });
            await CACHE.set(`${key}.verified`, 'true')
        } catch(e) {
            console.log(e)
            console.log(key)
        } 
    }   
}

verify()
.then(() => process.exit(0))
.catch(error => {
    console.error(error);
    process.exit(1);
});
