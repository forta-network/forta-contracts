const { ethers, defender } = require('hardhat');
const DEBUG                = require('debug')('forta');
const utils                = require('./utils');
const { AdminClient } = require('defender-admin-client');
const client = new AdminClient({apiKey: process.env.DEFENDER_API_KEY, apiSecret: process.env.DEFENDER_API_SECRET});

const SCANNER_ADDRESS = '0x7ADeCAe41FE19CD6B06b61B2F18ab70BCAD8fFC5'

async function main() {
    const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });

    if (!provider.network.ensAddress) {
        provider.network.ensAddress = await CACHE.get('ens-registry');
    }
    const stakingAddress = await CACHE.get('staking.address')
    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`ENS:      ${provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    const multisig = process.env[`POLYGON_MULTISIG_FUNDS`];
    DEBUG(`Multisig: ${'POLYGON_MULTISIG_FUNDS'} ${multisig}`);
    DEBUG(`Staking contract`, stakingAddress)
    DEBUG('Scanner id:', SCANNER_ADDRESS)
    DEBUG('----------------------------------------------------');

    const params = {
        contract: { address: stakingAddress, network: 'matic' }, // Target contract
        title: `Init withdrawal from old Foundry scanner`, // Title of the proposal
        description: 'So it unassigns bots.', // Description of the proposal
        type: 'custom', // Use 'custom' for custom admin actions
        functionInterface: {
            "inputs": [
              {
                "internalType": "uint8",
                "name": "subjectType",
                "type": "uint8"
              },
              {
                "internalType": "uint256",
                "name": "subject",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "sharesValue",
                "type": "uint256"
              }
            ],
            "name": "initiateWithdrawal",
            "outputs": [
              {
                "internalType": "uint64",
                "name": "",
                "type": "uint64"
              }
            ],
            "stateMutability": "nonpayable",
            "type": "function"
        }, // Function ABI
        functionInputs: ["0", SCANNER_ADDRESS, ethers.utils.parseEther('500').toString()], // Arguments to the function
        via: multisig, // Multisig address
        viaType: 'Gnosis Safe', // Either Gnosis Safe or Gnosis Multisig,
        //metadata: { operationType: 'delegateCall' }, // Issue a delegatecall instead of a regular call
    }
    console.dir(params)
    console.dir(params.functionInterface)

    const result = await client.createProposal(params);
    console.log(result)
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
