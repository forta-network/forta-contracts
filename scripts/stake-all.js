const { constants } = require('ethers')
const { ethers } = require('hardhat');
const parseEther = ethers.utils.parseEther;
const DEBUG                = require('debug')('forta');
const utils                = require('./utils');

const CHILD_CHAIN_MANAGER_PROXY = {
    137:   '0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa',
    80001: '0xb5505a6d998549090530911180f38aC5130101c6',
};

const AMOUNT = parseEther('1')

async function stakeAll(config = {}) {
    const provider = config.provider ?? await utils.getDefaultProvider();
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
    const contracts = config.contracts ?? await Promise.all(Object.entries({
        forta: utils.attach(childChainManagerProxy ? 'FortaBridgedPolygon' : 'Forta',  await CACHE.get('forta.address') ).then(contract => contract.connect(deployer)),
        //agents: utils.attach('AgentRegistry',  await CACHE.get('agents.address')  ).then(contract => contract.connect(deployer)),
        scanners: utils.attach('ScannerRegistry',await CACHE.get('scanners.address')  ).then(contract => contract.connect(deployer)),
        staking: utils.attach('FortaStaking',await CACHE.get('staking.address')  ).then(contract => contract.connect(deployer)),

        //dispatch: utils.attach('Dispatch', await CACHE.get('dispatch.address') ).then(contract => contract.connect(deployer))
    }).map(entry => Promise.all(entry))).then(Object.fromEntries);
    const [signer] = await ethers.getSigners();

    let firstTx = config.firstTx ?? await CACHE.get('scanners-pending');
    
    const mintings = await utils.getEventsFromTx(firstTx, `Transfer`, contracts.scanners, [constants.AddressZero], provider);
    const tokenIds = mintings.map(x => x.args.tokenId);

    for (const scannerId of tokenIds) {
        console.log('Checking...', scannerId.toHexString());
        console.log(await contracts.scanners.getStakeThreshold(scannerId.toHexString()))
        const activeStake = await contracts.staking.activeStakeFor(SUBJECT_TYPE, scannerId)
        if (activeStake.gte(DEFAULT_STAKE)) {
            console.log('Already staked');
            continue;
        }
        const allowance = await contracts.forta.allowance(signer.address, contracts.staking.address)
        console.log(allowance.toString())
        console.log(DEFAULT_STAKE.toString())
        if (DEFAULT_STAKE.gt(allowance)) {
            console.log('Approving ERC20...')
            const approvalTx = await contracts.forta.connect(signer).approve(contracts.staking.address, DEFAULT_STAKE.toString());
            await approvalTx.wait();
            console.log('Approved.');
        }
        console.log('Staking...')
        const stkTx = await contracts.staking.deposit(SUBJECT_TYPE, scannerId, DEFAULT_STAKE);
        console.log('Staked');
        console.log(stkTx);
    }
}

if (require.main === module) {
    stakeAll()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = stakeAll;

