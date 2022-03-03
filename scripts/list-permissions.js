const { ethers } = require('hardhat');
const DEBUG                = require('debug')('forta:list-permissions');
const utils                = require('./utils');

let roles = {}

async function loadRoles() {
    roles[ethers.constants.HashZero] = 'DEFAULT_ADMIN';
    roles[ethers.utils.id('ADMIN_ROLE')] = 'ADMIN';
    roles[ethers.utils.id('MINTER_ROLE')] = 'MINTER';
    roles[ethers.utils.id('WHITELISTER_ROLE')] = 'WHITELISTER';
    roles[ethers.utils.id('WHITELIST_ROLE')] = 'WHITELIST';
    roles[ethers.utils.id('ROUTER_ADMIN_ROLE')] = 'ROUTER_ADMIN';
    roles[ethers.utils.id('ENS_MANAGER_ROLE')] = 'ENS_MANAGER';
    roles[ethers.utils.id('UPGRADER_ROLE')] = 'UPGRADER';
    roles[ethers.utils.id('AGENT_ADMIN_ROLE')] = 'AGENT_ADMIN';
    roles[ethers.utils.id('SCANNER_ADMIN_ROLE')] = 'SCANNER_ADMIN';
    roles[ethers.utils.id('DISPATCHER_ROLE')] = 'DISPATCHER';
    roles[ethers.utils.id('SLASHER_ROLE')] = 'SLASHER';
    roles[ethers.utils.id('SWEEPER_ROLE')] = 'SWEEPER';
    roles[ethers.utils.id('REWARDS_ADMIN_ROLE')] = 'REWARDS';
    roles[ethers.utils.id('SCANNER_VERSION_ROLE')] = 'SCANNER_VERSION';
}

async function markdownTablePermissions(contract, key, cache) {
    const grantedLogs = await utils.getEventsFromContractCreation(cache, key, 'RoleGranted', contract)
    const revokedLogs = await utils.getEventsFromContractCreation(cache, key, 'RoleRevoked', contract)

    const header = ['| Role | Address |', '| -- | -- |'];

    const rows = grantedLogs.map(log => { 
        return { role: roles[log.args.role], account: log.args.account, blockNumber: log.blockNumber }
    })
    .filter( log => !revokedLogs.find( rLog => roles[rLog.args.role] === log.role && rLog.blockNumber >= log.blockNumber))
    .sort((a, b) => {
        return ('' + a.role).localeCompare(b.role)
    }).map(log => `| ${log.role} | ${log.account} |`)
    console.log(key);
    const table = header.concat(rows);
    for(const row of table) {
        console.log(row)
    }
}

async function main() {
    await loadRoles();
    const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });

    console.log(`Network:  ${name} (${chainId})`);

    await utils.migrateAddress(CACHE, 'forta');
    await utils.migrateAddress(CACHE, 'access');
    const fortaContract = chainId === 80001 || chainId === 137 ? 'FortaBridgedPolygon' : 'Forta';
    const contracts = {};
    contracts.forta = await (utils.attach(fortaContract,  await CACHE.get('forta.address')).then(contract => contract.connect(deployer)));

    await markdownTablePermissions(contracts.forta, 'forta', CACHE);
    const accessAddress = await CACHE.get('access.address');
    if (!accessAddress) {
        return
    }
    contracts.access = accessAddress ? await (utils.attach('AccessManager', accessAddress).then(contract => contract.connect(deployer))) : null;

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