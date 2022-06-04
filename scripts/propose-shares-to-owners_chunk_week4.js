const { ethers } = require('hardhat');
const BigNumber = ethers.BigNumber;
const parseEther = ethers.utils.parseEther;
const DEBUG = require('debug')('forta');
const utils = require('./utils');
// const rewardables = require('./data/rewards_result.json');
// const rewardables = require('./data/rewards_week3_result.json');
const _ = require('lodash');
const rewardables = require('./data/rewards_week4_result.json');
const fs = require('fs');
const { AdminClient } = require('defender-admin-client');
const client = new AdminClient({ apiKey: process.env.DEFENDER_API_KEY, apiSecret: process.env.DEFENDER_API_SECRET });
const MULTISIG = process.env.POLYGON_MULTISIG_FUNDS;

const AMOUNT = parseEther('500');

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

    
    const chunkitos = require('./data/share_transfer_chunks_week4.json');
    let chunkZero = chunkitos[0];

    const chunkSize = chunkZero.length;
    var chunkNumber =1;

    const balances = await Promise.all(chunkZero.map((x) => contracts.staking.balanceOf('0xC99884BE6eEE5533Be08152C40DF0464B3FAE877', x.activeShareId)));
    console.log(balances.map(x => x.toString()))
    chunkZero = chunkZero
        .map((x, index) => {
            return {
                ...x,
                amount: balances[index],
                transferCalldata: contracts.staking.interface.encodeFunctionData('safeTransferFrom', [
                    MULTISIG,
                    ethers.utils.getAddress(x.owner),
                    x.activeShareId,
                    x.amount.toString(),
                    ethers.constants.HashZero,
                ]),
            };
        })
        .filter((x) => x.amount.gt(ethers.BigNumber.from('0')))
        .map((x) => {
            return {
                ...x,
                amount: x.amount.toString(),
            };
        });
    console.log(chunkZero)
    fs.writeFileSync('./scripts/data/share_transfer_chunk0_week4.json', JSON.stringify(chunkZero));
    return
    // console.log(excludingOurOwn);
    console.log(await getParams(contracts.staking.address, MULTISIG, 1, 4, [chunkZero.map((x) => x.transferCalldata)]));
    /*
    const results = await Promise.all(
        excludingOurOwn.chunk(chunkSize).map((chunk) => {
            chunkNumber++;
            return getParams(contracts.staking.address, MULTISIG, chunkNumber, chunkTotal, [chunk.map((x) => x.transferCalldata)]);
        })
    );
    console.log(results);
    console.log(results.map((x) => x.url));*/
}

function getParams(stakingAddress, multisig, chunkNumber, chunkTotal, functionInput) {
    const params = {
        contract: { address: stakingAddress, network: 'matic' }, // Target contract
        title: `Distribute Shares Week 4 (${chunkNumber}/${chunkTotal})`, // Title of the proposal
        description: 'To owners.', // Description of the proposal
        type: 'custom', // Use 'custom' for custom admin actions
        functionInterface: MULTICALL_ABI,
        functionInputs: functionInput, // Arguments to the function
        via: multisig, // Multisig address
        viaType: 'Gnosis Safe', // Either Gnosis Safe or Gnosis Multisig,
        //metadata: { operationType: 'delegateCall' }, // Issue a delegatecall instead of a regular call
    };
    console.log(params);
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
