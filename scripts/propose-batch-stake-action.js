const { ethers } = require('hardhat');
const DEBUG = require('debug')('forta');
const utils = require('./utils');
const { AdminClient } = require('defender-admin-client');
const client = new AdminClient({ apiKey: process.env.DEFENDER_API_KEY, apiSecret: process.env.DEFENDER_API_SECRET });

async function main() {
    const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });

    if (!provider.network.ensAddress) {
        provider.network.ensAddress = await CACHE.get('ens-registry');
    }
    const fortaAddress = await CACHE.get('forta.address');
    const batchRelayerAddress = await CACHE.get('batch-relayer.address');
    const role = ethers.utils.id('WHITELISTER_ROLE');
    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`ENS:      ${provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    const multisig = process.env[`POLYGON_MULTISIG`];
    DEBUG(`Multisig: ${'POLYGON_MULTISIG'} ${multisig}`);
    DEBUG(`rolet`, role);
    DEBUG('batchRelayerAddress:', batchRelayerAddress);
    DEBUG('----------------------------------------------------');

    const params = {
        contract: { address: fortaAddress, network: 'matic' }, // Target contract
        title: `Make BatchRelayer WHITELISTER_ROLE`, // Title of the proposal
        description: 'To enable rewards.', // Description of the proposal
        type: 'custom', // Use 'custom' for custom admin actions
        functionInterface: {
            inputs: [
                {
                    internalType: 'bytes32',
                    name: 'role',
                    type: 'bytes32',
                },
                {
                    internalType: 'address',
                    name: 'account',
                    type: 'address',
                },
            ],
            name: 'grantRole',
            outputs: [],
            stateMutability: 'nonpayable',
            type: 'function',
        }, // Function ABI
        functionInputs: [role, batchRelayerAddress], // Arguments to the function
        via: multisig, // Multisig address
        viaType: 'Gnosis Safe', // Either Gnosis Safe or Gnosis Multisig,
        //metadata: { operationType: 'delegateCall' }, // Issue a delegatecall instead of a regular call
    };
    console.dir(params);
    console.dir(params.functionInterface);

    const result = await client.createProposal(params);
    console.log(result);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
