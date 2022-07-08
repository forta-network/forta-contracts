const { constants } = require('ethers');
const { ethers } = require('hardhat');
const DEBUG = require('debug')('forta');
const utils = require('./utils');
const stakingUtils = require('./utils/staking.js');

const CHILD_CHAIN_MANAGER_PROXY = {
    137: '0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa',
    80001: '0xb5505a6d998549090530911180f38aC5130101c6',
};

const MULTISIG = process.env.POLYGON_MULTISIG_FUNDS;

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
    const childChainManagerProxy = chainId === 31337 ? false : config.childChainManagerProxy ?? CHILD_CHAIN_MANAGER_PROXY[chainId];

    const SUBJECT_TYPE = config.subjectType ?? 0;

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`Multisig: ${MULTISIG}`);
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
    const [signer] = await ethers.getSigners();

    let firstTx = config.firstTx ?? (await CACHE.get('scanners-pending'));

    const mintings = await utils.getEventsFromTx(firstTx, `Transfer`, contracts.scanners, [constants.AddressZero], provider);
    const tokenIds = mintings.map((x) => x.args.tokenId);
    const ids = [];
    const amounts = [];
    for (const scannerId of tokenIds) {
        console.log('Getting Active shares...', scannerId);
        const activeSubjectId = stakingUtils.subjectToActive(SUBJECT_TYPE, scannerId);
        console.log('Active Subject ID:', activeSubjectId.toString());
        const activeShares = await contracts.staking.balanceOf(signer.address, activeSubjectId);
        console.log('Active Share Balance:', activeShares.toString());
        if (!activeShares.eq(ethers.BigNumber.from(0))) {
            console.log('Adding Active to batch...');
            ids.push(activeSubjectId.toString());
            amounts.push(activeShares.toString());
        } else {
            console.log('No active shares');
        }
    }
    console.log('ids:', ids.length);
    console.log('ids', ids);
    console.log('amounts:', amounts.length);
    console.log('Transfering...');
    console.log(await contracts.staking.safeBatchTransferFrom(signer.address, MULTISIG, ids, amounts, '0x'));
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
