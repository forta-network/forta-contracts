const { constants } = require('ethers')
const { ethers } = require('hardhat');
const parseEther = ethers.utils.parseEther;
const DEBUG                = require('debug')('forta');
const utils                = require('./utils');
const fs = require('fs');

const AMOUNT = parseEther('500')

async function stakeAll(config = {}) {
    const provider = config.provider ?? await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

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
    const fortaContract = chainId === 137 || chainId === 80001 ? 'FortaBridgedPolygon' : 'Forta'

    const DEFAULT_STAKE = config.defaultStake ?? AMOUNT;
    const SUBJECT_TYPE = config.subjectType ?? 0;
    DEBUG(`fortaContract:  ${fortaContract}`);
    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG('----------------------------------------------------');
    
    const contracts = config.contracts ?? await Promise.all(Object.entries({
        forta: utils.attach(fortaContract,  await CACHE.get('forta.address') ).then(contract => contract.connect(deployer)),
        //agents: utils.attach('AgentRegistry',  await CACHE.get('agents.address')  ).then(contract => contract.connect(deployer)),
        scanners: utils.attach('ScannerRegistry',await CACHE.get('scanners.address')  ).then(contract => contract.connect(deployer)),
        staking: utils.attach('FortaStaking',await CACHE.get('staking.address')  ).then(contract => contract.connect(deployer)),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries);
    const [signer] = await ethers.getSigners();

    let firstTx = config.firstTx ?? await CACHE.get('scanners-pending');
    
    //const mintings = await utils.getEventsFromTx(firstTx, `Transfer`, contracts.scanners, [constants.AddressZero], provider);
    //console.log(mintings.map(x => x.args))
    //const tokenIds = mintings.map(x => x.args.tokenId);
    const tokenIds = [
        '0x9d11ad0ff6d8ceae38370def0c6e36541c8f8f1c',
        '0x453ee833666e414dbc4c9b93ea1763a142fbcd6d',
        '0xcee2d25e70ed308606a16f39e617ab2e485d5450',
        '0x8903c3c82f99574f677c099a9bac852e228cf422',
        '0x4d0d2477287c53ebd099ca5e5e5ffcae18aa31ef',
        '0x7a60d417ea2460076f805729f83be9395813ba5f',
        '0xbdc6ac6a80e579a91d580b855baf56d78da52d74',
        '0xe56e69334a82011379e461d216b7733b9bd745bf',
        '0x91de4c633b93c13cc7c5e23d306cd8cf79461e79',
        '0x29b8a3fa2337cadf2987d40ea478bb7ff22de6ef',
        '0x2dc5503eac6c469304066acacf0a74f8257bcf9e',
        '0x3dc45b47b7559ca3b231e5384d825f9b461a0398',
        '0x556f8be42f76c01f960f32cb1936d2e0e0eb3f4d',
        '0xe870840564d7395cc0f267f23cd85fa498b07a58',
        '0x0fefe9cce526db1b310c40dde1f87c8882c7b6f9',
        '0xeb2030c200b8f9bad5dcb476f1e169612a02bef6'
    ]
    
    console.log('Total Scanners: ', tokenIds.length);
    const scannerOutput = {};
    for (const scannerId of tokenIds) {
        console.log('Checking...', scannerId/*.toHexString()*/);
        const scannerState = await contracts.scanners.getScannerState(scannerId);      
        scannerState.chainId = scannerState.chainId.toNumber()
        console.log('Stake Threshold', await contracts.scanners.getStakeThreshold(scannerId/*.toHexString()*/));
        const activeStake = await contracts.staking.activeStakeFor(SUBJECT_TYPE, scannerId);
        scannerOutput[scannerId/*.toHexString()*/] = {
            state: scannerState,
            activeStake: ethers.utils.formatEther(activeStake)
        }
        const isStakedOverMin = await contracts.scanners.isStakedOverMin(scannerId/*.toHexString()*/);
        if (activeStake.gte(DEFAULT_STAKE)) {
            console.log('Already staked');
            continue;
        }
        DEBUG(scannerState);
        if (!scannerState.enabled && isStakedOverMin) {
            console.log('Scanner disabled, skipping...');
            continue;
        }
        const allowance = await contracts.forta.allowance(signer.address, contracts.staking.address);
        console.log('allowance', allowance.toString());
        console.log('need to stake:', DEFAULT_STAKE.toString());
        if (DEFAULT_STAKE.gt(allowance)) {
            console.log('Approving Fort...');
            const approvalTx = await contracts.forta.connect(signer).approve(contracts.staking.address, DEFAULT_STAKE.toString());
            await approvalTx.wait();
            console.log('Approved.');
        }
        console.log('Staking...');
        const stkTx = await contracts.staking.deposit(SUBJECT_TYPE, scannerId, DEFAULT_STAKE);
        console.log('Staked');
        console.log(await stkTx.wait());
    }
    //console.log('Enabled scanners:', enabledScanners.length);
    console.log('--------------------- Output: ---------------------');
    fs.writeFileSync('./stake-output.json', JSON.stringify(scannerOutput))
    Object.entries(scannerOutput).forEach(x => console.dir(x));
    console.log('---------------------------------------------------');

    const chainIds = new Set(Object.entries(scannerOutput).map( x => x[1].state.chainId.toNumber()));
    console.log('Chain Ids: ', chainIds);
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

