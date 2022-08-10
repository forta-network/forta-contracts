const { ethers } = require('hardhat');
const parseEther = ethers.utils.parseEther;
const DEBUG = require('debug')('forta');
const utils = require('./utils');
require('dotenv/config');
console.log(process.env);
const { DefenderRelayProvider, DefenderRelaySigner } = require('defender-relay-client/lib/ethers');

const credentials = { apiKey: process.env.DEFENDER_RELAYER_KEY, apiSecret: process.env.DEFENDER_RELAYER_SECRET };
console.log(credentials)
const provider = new DefenderRelayProvider(credentials);
const signer = new DefenderRelaySigner(credentials, provider, { speed: 'fast' });
const SUBJECT_IDS = [];
const SUBJECT_TYPE = 0;

async function stakeAll(config = {}) {

    const { name, chainId } = await provider.getNetwork();

    let configName;
    if (chainId === 5) {
        configName = chainId === 5 ? '.cache-5-with-components' : `.cache-${chainId}`;
    } else {
        if (chainId === 1) {
            throw new Error('Mainnet not supported');
        }
        configName = `.cache-${chainId}`;
    }
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: configName });
    const fortaContract = chainId === 137 || chainId === 80001 ? 'FortaBridgedPolygon' : 'Forta';

    DEBUG(`fortaContract:  ${fortaContract}`);
    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`signer: ${signer.address}`);
    DEBUG('----------------------------------------------------');

    const contracts =
        config.contracts ??
        (await Promise.all(
            Object.entries({
                staking: utils.attach('FortaStaking', await CACHE.get('staking.address')).then((contract) => contract.connect(signer)),
            }).map((entry) => Promise.all(entry))
        ).then(Object.fromEntries));

    const toUnstake = require('./data/active_shares_0x15d3c7e811582Be09Bb8673cD603Bb2F22D1e47B.json').subjectIdsAndAmounts;
    DEBUG('staking...');
    const stakingCalls = toUnstake.map((item) => contracts.staking.interface.encodeFunctionData('initiateWithdrawal', [SUBJECT_TYPE, item.id, parseEther(item.amount)]));
    DEBUG('staking ', stakingCalls.length);

    const stakingReceipts = await Promise.all(
        stakingCalls.chunk(50).map((chunk) => {
            DEBUG('chunk', chunk.length);
            return contracts.staking.multicall(chunk);
        })
    );

    console.log('unstaked.');
    console.log(stakingReceipts);

}

if (require.main === module) {
    stakeAll()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = stakeAll;
