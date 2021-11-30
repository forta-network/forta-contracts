require('dotenv/config');

const HDWalletProvider   = require('@truffle/hdwallet-provider')
const { MaticPOSClient } = require('@maticnetwork/maticjs');
const { ethers }         = require('ethers');

function revert(message = 'unknown error') { throw new Error(message); }

const RPC = {
    v1: {
        parent: process.env.MAINNET_NODE,
        matic:  process.env.POLYGON_NODE,
    },
    testnet: {
        parent: process.env.GOERLI_NODE,
        matic:  process.env.MUMBAI_NODE,
    },
}

function getProvider(rpc, mnemonic = process.env.MNEMONIC) {
    // return ethers.Wallet.fromMnemonic(mnemonic).connect(ethers.getDefaultProvider(rpc));
    return new HDWalletProvider(mnemonic, rpc);
}

async function main(burnTxHash, network = 'testnet') {
    const rpcs    = RPC[network] || revert('invalid network');
    const signers = Object.fromEntries(Object.entries(rpcs).map(([ key, rpc ]) => [ key, getProvider(rpc) ]));

    const maticPOSClient = new MaticPOSClient({
        network:        'testnet',
        version:        'mumbai',
        parentProvider: signers.parent,
        maticProvider:  signers.matic,
    });

    console.log('execute...')
    await maticPOSClient.exitERC20(burnTxHash, { from: Object.keys(signers.parent.wallets).find(Boolean) })
    .then(() => console.log('success'))
    .catch(error => console.error('[ERROR]', error));
}

const burnTxHash = process.env.BURNTXHASH || '0x603f9b3e6729537d011bb3d4d415743eb95f89aabf5d8573867fb4afd97c58dc';

main(burnTxHash)
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
