const { ethers } = require('hardhat');
const DEBUG = require('debug')('forta');
const utils = require('./utils');

const CHILD_CHAIN_MANAGER_PROXY = {
    137: '0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa',
    80001: '0xb5505a6d998549090530911180f38aC5130101c6',
};

const MULTISIG = process.env.POLYGON_MULTISIG_FUNDS;

function getRewardableNodes() {
    return require('./data/rewards_result.json');
}

async function main(config = {}) {
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

    const nodes = getRewardableNodes();

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`Multisig: ${MULTISIG}`);
    console.log('Rewardable Nodes:', nodes.length);

    DEBUG('----------------------------------------------------');
    const contracts =
        config.contracts ??
        (await Promise.all(
            Object.entries({
                forta: utils.attach(childChainManagerProxy ? 'FortaBridgedPolygon' : 'Forta', await CACHE.get('forta.address')).then((contract) => contract.connect(deployer)),
                //agents: utils.attach('AgentRegistry',  await CACHE.get('agents.address')  ).then(contract => contract.connect(deployer)),
                scanners: utils.attach('ScannerRegistry', await CACHE.get('scanners.address')).then((contract) => contract.connect(deployer)),
                staking: utils.attach('FortaStaking', await CACHE.get('staking.address')).then((contract) => contract.connect(deployer)),
            }).map((entry) => Promise.all(entry))
        ).then(Object.fromEntries));

    const receipt = await provider.getTransactionReceipt('0x0c497261f9cd81c29de7686d12bdfbd99027810eb86c37ce100608aa414737fd');

    const result = receipt.logs
        .filter((x) => x.topics[0] === '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62')
        .map((event) => {
            return ethers.utils.hexZeroPad(ethers.utils.hexValue(event.topics[3]), 20);
        })
        .map((owner) => {
            const node = nodes.filter((x) => x.owner.toLowerCase() === owner.toLowerCase())[0];
            return {
                ...node,
                balance: contracts.staking.sharesOf(0, node.address, owner),
            };
        });
    const balances = await Promise.all(result.map((x) => x.balance));
    console.log(balances);
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
