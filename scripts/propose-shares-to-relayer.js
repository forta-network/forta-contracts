const { ethers } = require('hardhat');
const BigNumber = ethers.BigNumber;
const parseEther = ethers.utils.parseEther;
const DEBUG = require('debug')('forta');
const utils = require('./utils');
let csvToJson = require('convert-csv-to-json');

const fs = require('fs');
const { AdminClient } = require('defender-admin-client');
const client = new AdminClient({ apiKey: process.env.DEFENDER_API_KEY, apiSecret: process.env.DEFENDER_API_SECRET });
const MULTISIG = process.env.POLYGON_MULTISIG_FUNDS;
const AMOUNT = parseEther('500');
const stakingUtils = require('./utils/staking.js');

const ABI = {
    inputs: [
        {
            internalType: 'address',
            name: 'from',
            type: 'address',
        },
        {
            internalType: 'address',
            name: 'to',
            type: 'address',
        },
        {
            internalType: 'uint256[]',
            name: 'ids',
            type: 'uint256[]',
        },
        {
            internalType: 'uint256[]',
            name: 'amounts',
            type: 'uint256[]',
        },
        {
            internalType: 'bytes',
            name: 'data',
            type: 'bytes',
        },
    ],
    name: 'safeBatchTransferFrom',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
};

function getMultisigActiveShares() {
    let data = csvToJson.fieldDelimiter(',').getJsonFromCsv('./scripts/data/shares-multisig.csv');
    console.log('ids', data.length);
    const activeShares = data
        .map((x) => BigNumber.from(x['Token_id']))
        .filter((share) => stakingUtils.isActive(share))
        .map((x) => x.toString());
    const uniqueActiveShares = Array.from(new Set(activeShares));
    console.log('unique and active', uniqueActiveShares.length);
    return uniqueActiveShares;
}

async function transferShares(config = {}) {
    const provider = config.provider ?? (await utils.getDefaultProvider());
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    let configName;
    if (chainId === 5) {
        configName = chainId === 5 ? '.cache-5-with-components' : `.cache-${chainId}`;
    } else {
        configName = `.cache-${chainId}`;
    }
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: configName });

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`Multisig: ${MULTISIG}`);
    DEBUG('----------------------------------------------------');
    const contracts =
        config.contracts ??
        (await Promise.all(
            Object.entries({
                //forta: utils.attach(FORTA_TOKEN_NAME[chainId],  await CACHE.get('forta.address') ).then(contract => contract.connect(deployer)),
                //agents: utils.attach('AgentRegistry',  await CACHE.get('agents.address')  ).then(contract => contract.connect(deployer)),
                //scanners: utils.attach('ScannerRegistry',await CACHE.get('scanners.address')  ).then(contract => contract.connect(deployer)),
                staking: utils.attach('FortaStaking', await CACHE.get('staking.address')).then((contract) => contract.connect(deployer)),
            }).map((entry) => Promise.all(entry))
        ).then(Object.fromEntries));

    const shares = getMultisigActiveShares();
    let chunkedShares = shares.chunk(20);
    const totalChunks = chunkedShares.length;
    console.log(totalChunks);
    fs.writeFileSync('./scripts/data/chunked-share-transfer.json', JSON.stringify(chunkedShares));
    chunkedShares = chunkedShares.slice(1, 22);

    const result = await Promise.all(
        chunkedShares.map((chunk, index) => {
            return getParams(contracts.staking.address, MULTISIG, index + 1, totalChunks, [
                MULTISIG,
                process.env.POLYGON_DEFENDER_RELAYER,
                chunk,
                chunk.map(() => AMOUNT.toString()),
                ethers.constants.HashZero,
            ]);
        })
    );
    console.log(result.map((x) => x.url));
}

function getParams(stakingAddress, multisig, chunkNumber, chunkTotal, functionInput) {
    const params = {
        contract: { address: stakingAddress, network: 'matic' }, // Target contract
        title: `Mutisig shares to relayer (${chunkNumber}/${chunkTotal})`, // Title of the proposal
        description: 'To owners.', // Description of the proposal
        type: 'custom', // Use 'custom' for custom admin actions
        functionInterface: ABI,
        functionInputs: functionInput, // Arguments to the function
        via: multisig, // Multisig address
        viaType: 'Gnosis Safe', // Either Gnosis Safe or Gnosis Multisig,
        //metadata: { operationType: 'delegateCall' }, // Issue a delegatecall instead of a regular call
    };
    return client.createProposal(params);
}

if (require.main === module) {
    transferShares()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = transferShares;
