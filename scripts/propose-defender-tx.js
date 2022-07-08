const { ethers, upgrades, network } = require('hardhat');
const DEBUG                = require('debug')('forta:multi-admin-tx');
const utils                = require('./utils');
const { AdminClient } = require('defender-admin-client');
const client = new AdminClient({apiKey: process.env.DEFENDER_API_KEY, apiSecret: process.env.DEFENDER_API_SECRET});


upgrades.silenceWarnings();

const grantRoleABI = {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "role",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "grantRole",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }

async function migrate(config = {}) {
    const provider = config?.provider ?? config?.deployer?.provider ?? await utils.getDefaultProvider();
    const deployer = config?.deployer ??                               await utils.getDefaultDeployer(provider);
    const { name, chainId } = await provider.getNetwork();
    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`Balance:  ${await provider.getBalance(deployer.address).then(ethers.utils.formatEther)}${ethers.constants.EtherSymbol}`);
    DEBUG('----------------------------------------------------');
    utils.assertNotUsingHardhatKeys(chainId, deployer);
    let networkName, defenderChainName
    if (name === 'matic') {
        networkName = 'POLYGON'
        defenderChainName = 'matic'
    } else if(name === 'homestead') {
        networkName = 'MAINNET'
        defenderChainName = 'mainnet'
    } else {
        networkName = name.toUppercase()
        defenderChainName = name
    }
     
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });
    
    const fortaAddress = await CACHE.get('forta.address')
    const multisig = process.env[`${networkName}_MULTISIG`];
    DEBUG('fortaAddress', fortaAddress);
    DEBUG(`Multisig: ${networkName} ${multisig}`);
    
    const result = await client.createProposal({
        contract: { address: fortaAddress, network: defenderChainName },
        title: `Grant WHITELIST_ROLE to Dummy VestingWallet`,
        description: 'Needed to test Staking from VestingWallets in production.',
        type: 'custom',
        functionInterface: grantRoleABI,
        functionInputs: [ethers.utils.id('WHITELISTER'), '0x243DaA239C68A2F3c29082c560d8d85ac7872149'],
        via: multisig,
        viaType: 'Gnosis Safe',
    });
    console.log(result)
    
    
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