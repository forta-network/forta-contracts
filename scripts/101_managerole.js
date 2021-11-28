const { ethers, upgrades } = require('hardhat');
const DEBUG                = require('debug')('forta');
const utils                = require('./utils');
const loadEnv              = require('./loadEnv');

upgrades.silenceWarnings();

async function main() {

    const { contracts, roles, deployer } = await loadEnv();

    // await contracts.access.grantRole(roles.UPGRADER,      deployer.address        ).then(tx => tx.wait());
    // await contracts.access.grantRole(roles.AGENT_ADMIN,   deployer.address        ).then(tx => tx.wait());
    // await contracts.access.grantRole(roles.SCANNER_ADMIN, deployer.address        ).then(tx => tx.wait());
    // await contracts.access.grantRole(roles.DISPATCHER,    deployer.address        ).then(tx => tx.wait());
    // await contracts.token .grantRole(roles.MINTER,        deployer.address        ).then(tx => tx.wait());
    // await contracts.token .grantRole(roles.WHITELISTER,   deployer.address        ).then(tx => tx.wait());
    // await contracts.token .grantRole(roles.WHITELIST,     contract.staking.address).then(tx => tx.wait());

    // await contracts.access.grantRole(roles.UPGRADER, deployer.address).then(tx => tx.wait());
    // await contracts.access.grantRole(roles.DISPATCHER, '0x9e857a04ebde96351878ddf3ad40164ff68c1ee1').then(tx => tx.wait());
    // await Promise.all(Object.values(contracts).map(contract => contract.setName(provider.network.ensAddress, contract.address).then(tx => tx.wait())));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
