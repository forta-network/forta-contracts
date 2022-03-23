const { ethers, upgrades, network } = require('hardhat');
const DEBUG                = require('debug')('forta:multi-admin-tx');
const utils                = require('./utils');
const { AdminClient } = require('defender-admin-client');
const client = new AdminClient({apiKey: process.env.DEFENDER_API_KEY, apiSecret: process.env.DEFENDER_API_SECRET});

upgrades.silenceWarnings();

Array.range = function(n) {
    return Array(n).fill().map((_, i) => i);
}

Array.prototype.unique = function(op = x => x) {
    return this.filter((obj, i) => this.findIndex(entry => op(obj) === op(entry)) === i);
}

Array.prototype.chunk = function(size) {
    return Array.range(Math.ceil(this.length / size)).map(i => this.slice(i * size, i * size + size))
}

//const TXLimiter = pLimit(16); // maximum 4 simulatenous transactions

async function sendBatchProposals({ target, relayer, multisig, calldatas, network, title, description}, batchsize = 16) {
    const batches = await Promise.all(calldatas).then(calldatas => calldatas.filter(Boolean).chunk(batchsize))
    var i = 1;
    for(const batch of batches) {
        const result = await client.createProposal({
            contract: { address: relayer, network: network }, // Target contract
            title: `${title} ${batches.length > 1 ? `${i}/${batches.length}` : ''}`, // Title of the proposal
            description: description, // Description of the proposal
            type: 'custom', // Use 'custom' for custom admin actions
            functionInterface: { name: 'relay', inputs: [{ type: 'address', name: 'target' }, { type: 'bytes[]', name: 'data' }] }, // Function ABI
            functionInputs: [target, batch], // Arguments to the function
            via: multisig, // Multisig address
            viaType: 'Gnosis Safe', // Either Gnosis Safe or Gnosis Multisig,
            //metadata: { operationType: 'delegateCall' }, // Issue a delegatecall instead of a regular call
        });
        console.log(result)
    }
}

function grantRole(contract, role, account) {
    console.log(console)
    return contract.hasRole(role, account).then(hasRole => hasRole ? null : contract.interface.encodeFunctionData('grantRole', [ role, account ]));
}

function revokeRole(contract, role, account) {
    return contract.hasRole(role, account).then(hasRole => hasRole ? contract.interface.encodeFunctionData('revokeRole', [ role, account ]): null);
}

function mint(contract, account, amount) {
    return contract.balanceOf(account).then(balance => balance.isZero() ? contract.interface.encodeFunctionData('mint', [ account, amount ]): null);
}

function tokenContractForChain(chainId) {
    switch(chainId) {
        case 1:
        case 5:
        case 31337:
        return 'Forta';
        case 137:
        case 80001:
        return 'FortaStaking';
        default:
        throw new Error('unsupported chain')
    }
}

function role(name) {
    return ethers.utils.id(name);
}

/*********************************************************************************************************************
*                                                Migration workflow                                                 *
*********************************************************************************************************************/
async function migrate(config = {}) {
    const provider = config?.provider ?? config?.deployer?.provider ?? await utils.getDefaultProvider();
    const deployer = config?.deployer ??                               await utils.getDefaultDeployer(provider);
    const { name, chainId } = await provider.getNetwork();
    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`Balance:  ${await provider.getBalance(deployer.address).then(ethers.utils.formatEther)}${ethers.constants.EtherSymbol}`);
    DEBUG('----------------------------------------------------');
    utils.assertNotUsingHardhatKeys(chainId, deployer);
    
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });
    
    const relayer = await utils.attach('BatchRelayer', await CACHE.get('batch-relayer.address'));
    const forta = await utils.attach(tokenContractForChain(chainId), await CACHE.get('forta.address'));
    
    DEBUG(`Relayer: ${relayer.address}`);
    const multisig = process.env[`${name.toUpperCase()}_MULTISIG`];
    DEBUG(`Multisig: ${name.toUpperCase()} ${multisig}`);
    /*
    await sendBatchProposals({ 
        target: forta.address,
        relayer: relayer.address,
        multisig: multisig, 
        calldatas: [
            grantRole(forta, role('WHITELIST_ROLE'), '0x0000000000000000000000000000000000000001'),
            grantRole(forta, role('WHITELIST_ROLE'), '0x0000000000000000000000000000000000000002'),
            grantRole(forta, role('WHITELIST_ROLE'), '0x0000000000000000000000000000000000000003'),
            grantRole(forta, role('WHITELIST_ROLE'), '0x0000000000000000000000000000000000000004'),
        ], 
        network: name,
        title: 'Test mass grant role',
        description: 'Test'
    })
    */
    
    sendBatchProposals({
        target: forta.address,
        relayer: relayer.address,
        multisig: multisig, 
        calldatas: [
            revokeRole(forta, role('WHITELIST_ROLE'), '0x0000000000000000000000000000000000000001'),
            revokeRole(forta, role('WHITELIST_ROLE'), '0x0000000000000000000000000000000000000002'),
            revokeRole(forta, role('WHITELIST_ROLE'), '0x0000000000000000000000000000000000000003'),
            revokeRole(forta, role('WHITELIST_ROLE'), '0x0000000000000000000000000000000000000004'),
        ], 
        network: name,
        title: 'Test mass revoke role',
        description: 'Test'
    })
    
    
}

if (require.main === module) {
    migrate()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = migrate;