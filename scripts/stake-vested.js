const { ethers } = require('hardhat');
const parseEther = ethers.utils.parseEther;
const DEBUG = require('debug')('forta');
const utils = require('./utils');

const CHILD_CHAIN_MANAGER_PROXY = {
    137: '0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa',
    80001: '0xb5505a6d998549090530911180f38aC5130101c6',
};

const STAKING_ESCROW = '0x4A9293f17418F9412a3A3AA9343fc0A56Fc4a053';
const AMOUNT = parseEther('0.01');
const SUBJECT_ID = '0x4A9293f17418F9412a3A3AA9343fc0A56Fc4a053';

async function stakeAll(config = {}) {
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
    const childChainManagerProxy = chainId === 31337 ? false : config.childChainManagerProxy ?? CHILD_CHAIN_MANAGER_PROXY[chainId];

    const DEFAULT_STAKE = config.defaultStake ?? AMOUNT;
    const SUBJECT_TYPE = config.subjectType ?? 0;

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG('----------------------------------------------------');
    const contracts =
        config.contracts ??
        (await Promise.all(
            Object.entries({
                forta: utils.attach(childChainManagerProxy ? 'FortaBridgedPolygon' : 'Forta', await CACHE.get('forta.address')).then((contract) => contract.connect(deployer)),
                stakingEscrow: utils.attach('StakingEscrow', STAKING_ESCROW).then((contract) => contract.connect(deployer)),
            }).map((entry) => Promise.all(entry))
        ).then(Object.fromEntries));

    console.log(DEFAULT_STAKE.toString());

    console.log('Staking...');
    const stkTx = await contracts.stakingEscrow.functions['deposit(uint8,uint256,uint256)'](SUBJECT_TYPE, SUBJECT_ID, DEFAULT_STAKE, {
        maxFeePerGas: ethers.utils.parseUnits('300', 'gwei'),
        maxPriorityFeePerGas: ethers.utils.parseUnits('30', 'gwei'),
    });
    console.log('Staked');
    console.log(stkTx);
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
