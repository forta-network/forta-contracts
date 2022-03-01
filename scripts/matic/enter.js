require('dotenv/config');

const { ethers, network } = require('hardhat');
const utils              = require('../utils');
const DEBUG                = require('debug')('forta:enter');
const { POSClient, use, setProofApi } = require('@maticnetwork/maticjs');
const { Web3ClientPlugin            } = require('@maticnetwork/maticjs-ethers');
const { pos } = require('./config.js');

use(Web3ClientPlugin)

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

async function main(network = 'testnet') {
    const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);
    const { name, chainId } = await provider.getNetwork();
    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`Balance:  ${await provider.getBalance(deployer.address).then(ethers.utils.formatEther)}${ethers.constants.EtherSymbol}`);
    DEBUG('----------------------------------------------------');
    utils.assertNotUsingHardhatKeys(chainId, deployer);
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `../.cache-${chainId}` });
    const rpcs = RPC[network] || revert('invalid network');

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
    });


    const FortaL1 = await ethers.getContractFactory('Forta', deployer);
    const l1FortaAddress = await CACHE.get('forta.address')
    console.log(l1FortaAddress)
    const fortaL1 = await FortaL1.attach(l1FortaAddress);
    const fortL1Balance = await fortaL1.balanceOf(deployer.address)
    const amount = ethers.utils.parseEther('1');

    DEBUG('execute...');
    const WHITELIST_ROLE = ethers.utils.id('WHITELIST_ROLE')
    if (name !== 'mainnet') {
        
        if (fortL1Balance.lt(amount)) {
            DEBUG('minting...')
            DEBUG(await fortaL1.mint(deployer.address, amount))
        }
    }
    
    const rootTokenErc20 = client.erc20(pos.parent.erc20, true);
    DEBUG('approving...')
    await rootTokenErc20.approve(amount.toString())
    DEBUG('depositing...')
    const result = await rootTokenErc20.deposit(amount.toString(), deployer.address);

    DEBUG(await result.getTransactionHash());
    DEBUG(await result.getReceipt());

}


main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
