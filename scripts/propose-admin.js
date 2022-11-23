const hre = require('hardhat');
const { ethers } = hre;
const DEBUG = require('debug')('forta:propose');
const utils = require('./utils');

const { AdminClient } = require('defender-admin-client');
const client = new AdminClient({ apiKey: process.env.DEFENDER_API_KEY, apiSecret: process.env.DEFENDER_API_SECRET });

const config = {
    contractName: 'ScannerRegistry',
    contractTag: 'scanners',
    methodName: 'configureMigration',
    params: [['1670369819', '0x5aEBaFBc23167A51D06f217a046aAeD20c9ACcb1']],
    title: 'Set subject gateway',
    description: `
    await contracts.subjectGateway.connect(deployer).setStakeSubject(SCANNER_POOL_SUBJECT, contracts.scannerPools.address);

    `,
    network: null,
    multisig: null,
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
- Avalanche (chainID: 43114) -
- BSC (chainID: 56) -
- Arbitrum One (chainID: 42161) -
- Fantom Opera (chainID: 250) -
- Optimism (chainID: 10) -
*/
async function main() {
    const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    const deployment = require(`./.cache-${chainId}${chainId === 5 ? '-components' : ''}.json`);

    console.log(`Network:  ${name} (${chainId})`);
    console.log(`Deployer: ${deployer.address}`);
    console.log('----------------------------------------------------');
    config.network = hre.network.name === 'polygon' ? 'matic' : hre.network.name;
    config.multisig = process.env[`${hre.network.name.toUpperCase()}_MULTISIG`];
    const contract = await utils.attach(config.contractName, await deployment[config.contractTag].address).then((contract) => contract.connect(deployer));

    console.log('Config');
    console.log(config);
    const multicall = config.params.length > 1;
    let functionInterface, functionInputs, forceMulticall;

    if (!multicall) {
        const fragment = contract.interface.fragments.find((fragment) => fragment.name === config.methodName);
        functionInterface = JSON.parse(fragment.format(ethers.utils.FormatTypes.json));

        DEBUG(functionInterface.inputs[0]);

        functionInputs = config.params[0];
        console.log(functionInputs);
        forceMulticall = functionInterface.inputs[0].type === 'tuple';
    }
    console.log('multicall: ', multicall);
    console.log('forceMulticall: ', forceMulticall);

    if (multicall || forceMulticall) {
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
