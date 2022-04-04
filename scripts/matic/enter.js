require('dotenv/config');

const { ethers, network } = require('hardhat');
const utils              = require('../utils');
const DEBUG                = require('debug')('forta:enter');
const { POSClient, use, setProofApi } = require('@maticnetwork/maticjs');
const { Web3ClientPlugin            } = require('@maticnetwork/maticjs-ethers');


use(Web3ClientPlugin)

const AMOUNT = ethers.utils.parseEther('29999');


const RPC = {
    v1: {
        parent: { 
            node: process.env.MAINNET_NODE,
            mnemonic: process.env.MAINNET_MNEMONIC
        },
        child: {
            node: process.env.POLYGON_NODE,
            mnemonic: process.env.POLYGON_MNEMONIC
        }
    },
    testnet: {
        parent: { 
            node: process.env.GOERLI_NODE,
            mnemonic: process.env.GOERLI_MNEMONIC
        },
        child: {
            node: process.env.MUMBAI_NODE,
            mnemonic: process.env.MUMBAI_MNEMONIC
        }
    }
}

async function main() {
    const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);
    const { name, chainId } = await provider.getNetwork();
    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`Balance:  ${await provider.getBalance(deployer.address).then(ethers.utils.formatEther)}${ethers.constants.EtherSymbol}`);
    DEBUG('----------------------------------------------------');
    utils.assertNotUsingHardhatKeys(chainId, deployer);
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `../.cache-${chainId}` });
    let network
    if (chainId === 1) {
        network = 'mainnet';
    } else {
        network = 'testnet';
    }


    const CONFIG = require(`./config-${network}.json`);
    /*const rpcs = RPC[network] || revert('invalid network');

    const signers = {
        parent: ethers.Wallet.fromMnemonic(rpcs.parent.mnemonic).connect(ethers.getDefaultProvider(rpcs.parent.node)),
        child:  ethers.Wallet.fromMnemonic(rpcs.child.mnemonic).connect(ethers.getDefaultProvider(rpcs.child.node)),
    };
    const client = new POSClient();
    await client.init({
        network,
        version: 'mumbai',
        parent:  { provider: signers.parent, defaultConfig: { from: signers.parent.address }},
        child:   { provider: signers.child,  defaultConfig: { from: signers.child.address  }},
    });*/


    const FortaL1 = await ethers.getContractFactory('Forta', deployer);
    const l1FortaAddress = await CACHE.get('forta.address')
    console.log(l1FortaAddress)
    const fortaL1 = await FortaL1.attach(l1FortaAddress);
    const fortL1Balance = await fortaL1.balanceOf(deployer.address)

    const rootChainManager = new ethers.Contract(CONFIG.Main.POSContracts.RootChainManagerProxy, require('./root-chain-manager.json'), deployer);

    if (name !== 'mainnet') {
        
        if (fortL1Balance.lt(AMOUNT)) {
            DEBUG('minting...')
            DEBUG(await fortaL1.mint(deployer.address, AMOUNT))
        }
    }
    
    console.log('approving...')
    const tx = await fortaL1.approve(CONFIG.Main.POSContracts.ERC20PredicateProxy, AMOUNT)
    console.log(await tx.wait());

    console.log('depositing...')
    const encodedAmount = ethers.utils.defaultAbiCoder.encode(['uint256'], [AMOUNT])
    console.log(await rootChainManager.depositFor(deployer.address, fortaL1.address, encodedAmount))


}


main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
