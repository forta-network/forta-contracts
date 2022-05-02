const { ethers, upgrades } = require('hardhat');
const DEBUG                = require('debug')('forta:migration');
const utils                = require('./utils');


upgrades.silenceWarnings();

const ROOT_CHAIN_MANAGER = {
    1:     '0xA0c68C638235ee32657e8f720a23ceC1bFc77C77',
    5:     '0xBbD7cBFA79faee899Eaf900F13C9065bF03B1A74',
};


const formatL1VestingWallets = async (cache, chainId) => {
    const l1JSON = require(`./.cache-${chainId}.json`)
    const vestingWallets = Object.keys(l1JSON).filter(key => key.startsWith('vesting-') && !key.startsWith('vesting-dummy') && !key.endsWith('pending'))
    DEBUG('Vesting wallets to update in cache: ', vestingWallets.length)
    var i = 0
    for (vWallet of vestingWallets) {
        DEBUG(l1JSON[vWallet])
        await cache.set(`${vWallet}.address`, l1JSON[vWallet])
        await cache.set(`${vWallet}.impl.address`, await upgrades.erc1967.getImplementationAddress(l1JSON[vWallet]))
        DEBUG(`${i++}`);
    }
}

const getBeneficiaryList = (chainId) => {
    const l1JSON = require(`./.cache-${chainId}.json`)
    return Object.keys(l1JSON)
        .filter(key => key.startsWith('vesting-') && !key.startsWith('vesting-dummy') && !key.endsWith('pending'))
        .map(key => key.replace('vesting-', ''))
    
}


async function main() {
    const provider = config?.provider ?? config?.deployer?.provider ?? await utils.getDefaultProvider();
    const deployer = config?.deployer ??                               await utils.getDefaultDeployer(provider);
    const { name, chainId } = await provider.getNetwork();
    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`ENS:      ${provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`Balance:  ${await provider.getBalance(deployer.address).then(ethers.utils.formatEther)}${ethers.constants.EtherSymbol}`);
    
    DEBUG('----------------------------------------------------');
    utils.assertNotUsingHardhatKeys(chainId, deployer);
    
    const vestingBeneficiaries = getBeneficiaryList(chainId);
    const CACHE_L1 = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });
    

    let CACHE_L2
    
    const l1Token = await CACHE_L1.get('forta.address');

    let rootChainManager
    switch (chainId) {
        case 1:
            rootChainManager = ROOT_CHAIN_MANAGER[1];
            CACHE_L2 = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${137}` });
            break;
        case 5:
            rootChainManager = ROOT_CHAIN_MANAGER[5];
            CACHE_L2 = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${80001}` });
            break;
        default:
            throw new Error(`Unsupported chain ${chainId}`);

    }
    DEBUG('l1Token', l1Token)
    DEBUG('rootChainManager', rootChainManager)

    const l2EscrowFactory = await CACHE_L2.get('escrow-factory.address');
    const l2EscrowTemplate = await CACHE_L2.get('escrow-template.address');
    DEBUG('l2EscrowFactory', l2EscrowFactory)
    DEBUG('l2EscrowTemplate', l2EscrowTemplate)
    
    var index = 0;
    for(const beneficiary of vestingBeneficiaries) {
        console.log('Deployed for:', beneficiary)

        const VestingWalletV2 = await ethers.getContractFactory('VestingWalletV2', deployer)
        const vesting = await VestingWalletV2.deploy(rootChainManager, l1Token, l2EscrowFactory, l2EscrowTemplate)
        await CACHE_L1.set(`vesting-${beneficiary}.newImpl.address`, vesting.address)
        console.log('Deployed vesting wallet:', vesting.address);
        index++;
    }
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;