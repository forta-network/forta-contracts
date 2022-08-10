const { ethers } = require('hardhat');
const DEBUG = require('debug')('forta:propose');
const utils = require('./utils');

const { AdminClient } = require('defender-admin-client');
const client = new AdminClient({ apiKey: process.env.DEFENDER_API_KEY, apiSecret: process.env.DEFENDER_API_SECRET });

const shares = require('./data/active_shares_0xC99884BE6eEE5533Be08152C40DF0464B3FAE877.json');

const config = {
    network: 'matic',
    contractName: 'FortaStaking',
    contractTag: 'staking',
    methodName: 'initiateWithdrawal',
    params: shares.subjectIdsAndAmounts.map((x) => {
        return [0, x.id, ethers.utils.parseEther(x.amount).toString()];
    }),
    title: 'Initiate Withdrawal of Stake for Fortification nodes.',
    description: `
    Convert active shares to inactive shares and initiate 10 days delay period for unstaking. This will disable those nodes.
    [
        {
            "id": "0xadc4f36654515db4b97fe0e2acf41dd034045301",
            "amount": "437.5"
        },
        {
            "id": "0xe42d959078fcdb147b86f095569a35259da0d3c9",
            "amount": "50.0"
        },
        {
            "id": "0x4e5410808cfc9949ed822d235839ff9c7ec1f907",
            "amount": "500.0"
        },
        {
            "id": "0xdedf6fe353597e52add1e80af3bde3be1d176a59",
            "amount": "500.0"
        },
        {
            "id": "0x4090b07e688d91525878d0b279c030f75ad1cca6",
            "amount": "500.0"
        },
        {
            "id": "0x5e2ca70fad3934b27860ce15c11e697f8d60a184",
            "amount": "500.0"
        },
        {
            "id": "0xb80aece83d8748bc66c865605558cf134d7b7664",
            "amount": "500.0"
        },
        {
            "id": "0x50455da534140f3909affaa86042bd1ea9d272fc",
            "amount": "500.0"
        },
        {
            "id": "0xd63cb847d7464f41f68ff5c442743b90b1f8f400",
            "amount": "500.0"
        },
        {
            "id": "0x7ee526ef6e97452215b59bd8b97d7d9e1afb8d0a",
            "amount": "500.0"
        }
    ]
    `,
    multisig: process.env.POLYGON_MULTISIG_FUNDS,
};

const MULTICALL_ABI = {
    inputs: [
        {
            internalType: 'bytes[]',
            name: 'data',
            type: 'bytes[]',
        },
    ],
    name: 'multicall',
    outputs: [
        {
            internalType: 'bytes[]',
            name: 'results',
            type: 'bytes[]',
        },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
};

/*
- Ethereum Mainnet (chainID: 1) -
- Polygon (chainID: 137) -
- Avalance (chainID: 43114) -
- BSC (chainID: 56) -
- Arbitrum One (chainID: 42161) -
- Fantom Opera (chainID: 250) -
- Optimism (chainID: 10) -
*/
async function main() {
    const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    const deployment = require(`./.cache-${chainId}.json`);

    console.log(`Network:  ${name} (${chainId})`);
    console.log(`Deployer: ${deployer.address}`);
    console.log('----------------------------------------------------');

    const contract = await utils.attach(config.contractName, await deployment[config.contractTag].address).then((contract) => contract.connect(deployer));

    console.log('Config');
    console.log(config);
    const multicall = config.params.length > 1;
    console.log('multicall: ', multicall);
    let functionInterface, functionInputs;
    //console.log(contract.interface.functions)
    if (!multicall) {
        const fragment = contract.interface.fragments.find((fragment) => fragment.name === config.methodName);
        functionInterface = JSON.parse(fragment.format(ethers.utils.FormatTypes.json));

        DEBUG(functionInterface.inputs[0]);

        functionInputs = config.params[0];
    } else {
        DEBUG('multicall');
        if (!contract.interface.fragments.find((fragment) => fragment.name === 'multicall')) {
            throw new Error('Asumed multicall due to number of arguments, contract does not support multicall');
        }
        functionInterface = MULTICALL_ABI;
        DEBUG(functionInterface.inputs);

        functionInputs = [config.params.map((input) => contract.interface.encodeFunctionData(config.methodName, input))];
        DEBUG(functionInputs);
    }

    const params = {
        contract: { address: deployment[config.contractTag].address, network: config.network }, // Target contract
        title: config.title, // Title of the proposal
        description: config.description, // Description of the proposal
        type: 'custom', // Use 'custom' for custom admin actions
        functionInterface: functionInterface, // Function ABI
        functionInputs: functionInputs, // Arguments to the function
        via: config.multisig, // Multisig address
        viaType: 'Gnosis Safe', // Either Gnosis Safe or Gnosis Multisig,
        //metadata: { operationType: 'delegateCall' }, // Issue a delegatecall instead of a regular call
    };
    DEBUG(params);
    const result = await client.createProposal(params);
    DEBUG(result);
    console.log(result.url);
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;
