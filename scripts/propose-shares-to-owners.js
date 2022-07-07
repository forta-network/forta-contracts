const { ethers } = require('hardhat');
const BigNumber = ethers.BigNumber;
const parseEther = ethers.utils.parseEther;
const DEBUG = require('debug')('forta');
const utils = require('./utils');
// const rewardables = require('./data/rewards_result.json');
const rewardables = require('./data/rewards_week3_result.json');
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

    console.log('rewardables:', rewardables.length);
    // const deservingOfShares = rewardables.filter(x => BigNumber.from(x.rewardsMinusStake).gt(BigNumber.from('0'))) week1
    const deservingOfShares = rewardables.filter((x) => BigNumber.from(x.rewardsInShares).gt(BigNumber.from('0'))); // week3

    const excludingOurOwn = deservingOfShares.filter((x) => x.owner !== '0x8eedf056de8d0b0fd282cc0d7333488cc5b5d242');
    console.log('deservingOfShares:', deservingOfShares.length);
    console.log('excludingOurOwn:', excludingOurOwn.length);

    const shareBalances = await contracts.staking.balanceOfBatch(
        excludingOurOwn.map((x) => x.owner),
        excludingOurOwn.map((x) => x.activeShareId)
    );
    console.log('shareBalances:', shareBalances.length);

    const toSend = excludingOurOwn.filter((x, index) => shareBalances[index].eq(ethers.constants.Zero));
    console.log(toSend);
    console.log('toSend:', toSend.length);

    console.log('Transfering...');
    const chunkSize = 100;
    var chunkNumber = 0;
    console.log('chunkSize:', chunkSize);
    const chunkTotal = Math.ceil(toSend.length / chunkSize);
    console.log('Transfers:', chunkTotal);

    const results = await Promise.all(
        toSend
            .map((x) => {
                return {
                    ...x,
                    transferCalldata: contracts.staking.interface.encodeFunctionData('safeTransferFrom', [MULTISIG, x.owner, x.activeShareId, AMOUNT, ethers.constants.HashZero]),
                };
            })
            .chunk(chunkSize)
            .map((chunk) => {
                chunkNumber++;
                return getParams(contracts.staking.address, MULTISIG, chunkNumber, chunkTotal, [chunk.map((x) => x.transferCalldata)]);
            })
    );
    console.log(results);
    console.log(results.map((x) => x.url));
}

function getParams(stakingAddress, multisig, chunkNumber, chunkTotal, functionInput) {
    const params = {
        contract: { address: stakingAddress, network: 'matic' }, // Target contract
        title: `Distribute Shares (${chunkNumber}/${chunkTotal})`, // Title of the proposal
        description: 'To owners.', // Description of the proposal
        type: 'custom', // Use 'custom' for custom admin actions
        functionInterface: MULTICALL_ABI,
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
