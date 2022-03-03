require('dotenv/config');

const { ethers                      } = require('ethers');
const { POSClient, use, setProofApi } = require('@maticnetwork/maticjs');
const { Web3ClientPlugin            } = require('@maticnetwork/maticjs-ethers');
const utils              = require('../utils');

const argv = require('yargs/yargs')(process.argv.slice(2))
    .env('')
    .options({
        network:   { type: 'string', choices: [ 'mainnet-v1', 'testnet-mumbai' ], default: 'testnet-mumbai'        },
        proofApi:  { type: 'string', default: 'https://apis.matic.network/'                                        },
        parentRPC: { type: 'string', default: process.env.GOERLI_NODE                                              },
        childRPC:  { type: 'string', default: process.env.MUMBAI_NODE                                      },
        mnemonic:  { type: 'string', default: process.env.GOERLI_MNEMONIC                                          },
        txHash:    { type: 'string', default: '0x32a44d499403b8229ae1444e4cbd8cffe0b0d83fd7de57d585ef15a86b9db27b' },
    })
    .argv;

use(Web3ClientPlugin)
setProofApi(argv.proofApi);

async function main() {
    const signers = {
        parent: ethers.Wallet.fromMnemonic(argv.mnemonic).connect(ethers.getDefaultProvider(argv.parentRPC)),
        child:  ethers.Wallet.fromMnemonic(argv.mnemonic).connect(ethers.getDefaultProvider(argv.childRPC)),
    };

    const [ network, version ] = argv.network.split('-');
    console.log('Network', network);
    console.log('Version', version);
    console.log('Tx', argv.txHash);
    const chainId = network === 'testnet' ? 5 : 1; 
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `../.cache-${chainId}` });
    const client = new POSClient();
    await client.init({
        network,
        version,
        parent:  { provider: signers.parent, defaultConfig: { from: signers.parent.address }},
        child:   { provider: signers.child,  defaultConfig: { from: signers.child.address  }},
    });
    const result = await client.isCheckPointed(argv.txHash);

    console.log("isCheckPointed", result);
    if (!result) {
        console.log('Withdrawal not available yet.');
        return;
    }
    const erc20Token = client.erc20(await CACHE.get('forta.address'), true);

    const withdrawalResult = await erc20Token.withdrawExit(argv.txHash);

    const txHash = await withdrawalResult.getTransactionHash();
    console.log("txHash", txHash);
    const receipt = await withdrawalResult.getReceipt();
    console.log("receipt", receipt);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });