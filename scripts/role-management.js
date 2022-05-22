const utils = require('./utils');
const DEBUG = require('debug')('forta:roles');
const { ethers } = require('hardhat');

// Roles dictionary
const accessRoles = {
    DEFAULT_ADMIN: ethers.constants.HashZero,
    ADMIN: ethers.utils.id('ADMIN_ROLE'),
    //MINTER:               ethers.utils.id('MINTER_ROLE'),
    //WHITELISTER:          ethers.utils.id('WHITELISTER_ROLE'),
    //WHITELIST:            ethers.utils.id('WHITELIST_ROLE'),
    ROUTER_ADMIN: ethers.utils.id('ROUTER_ADMIN_ROLE'),
    ENS_MANAGER: ethers.utils.id('ENS_MANAGER_ROLE'),
    UPGRADER: ethers.utils.id('UPGRADER_ROLE'),
    AGENT_ADMIN: ethers.utils.id('AGENT_ADMIN_ROLE'),
    SCANNER_ADMIN: ethers.utils.id('SCANNER_ADMIN_ROLE'),
    //DISPATCHER:           ethers.utils.id('DISPATCHER_ROLE'),
    //SLASHER:              ethers.utils.id('SLASHER_ROLE'),
    //SWEEPER:              ethers.utils.id('SWEEPER_ROLE'),
    //REWARDS_ADMIN:        ethers.utils.id('REWARDS_ADMIN_ROLE'),
    SCANNER_VERSION: ethers.utils.id('SCANNER_VERSION_ROLE'),
};

const MODE = 'REVOKE';
const target = '0x2f73b85d78b38e90c64830C06A96be318a6E2154'; //process.env.POLYGON_MULTISIG

async function main() {
    const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    //const childChainManagerProxy = CHILD_CHAIN_MANAGER_PROXY[chainId] ?? false;
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`target: ${target}`);
    DEBUG('----------------------------------------------------');

    const access = await utils.attach('AccessManager', await CACHE.get('access.address')).then((contract) => contract.connect(deployer));

    console.log(`MODE:`, MODE);
    console.log(Object.keys(accessRoles));
    for (const key of Object.keys(accessRoles)) {
        console.log(`Checking Role ${key} for ${target}...`);
        const hasRole = await access.hasRole(accessRoles[key], target);
        console.log(hasRole);
        if (MODE === 'GRANT' && !hasRole) {
            console.log('Granting...');
            console.log(await access.grantRole(accessRoles[key], target));
        } else if (MODE === 'REVOKE' && hasRole) {
            console.log('Revoking...');
            console.log(await access.revokeRole(accessRoles[key], target));
        } else {
            console.log('No action needed');
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
