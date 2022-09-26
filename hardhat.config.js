require('dotenv/config');
require('@nomiclabs/hardhat-ethers');
require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-etherscan');
require('solidity-coverage');
require('solidity-docgen');
require('hardhat-gas-reporter');
require('@openzeppelin/hardhat-upgrades');
require('@openzeppelin/hardhat-defender');
const { task } = require('hardhat/config')
const { relative } = require('path');

const argv = require('yargs/yargs')().env('').argv;

task('compare-storage', 'Prints storage layout of 2 implementations')
    .addParam('old', 'Old contract name')
    .addParam('new', 'New contract name')
    .setAction(async (taskArgs) => {
        const storageToTable = require('./scripts/storage-to-table');
        storageToTable({ old: taskArgs.old, new: taskArgs.new });
    });

task('forta:share-type', 'Checks if a list of shares is active or inactive')
    .addParam('ids', 'Array of ids')
    .setAction(async (taskArgs) => {
        const getShareTypes = require('./scripts/get-share-types');
        getShareTypes({ shareIds: taskArgs.ids.split(',') });
    });

module.exports = {};

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
    solidity: {
        compilers: [
            {
                version: '0.8.9',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            },
        ],
    },
    networks: { hardhat: {} },
    mocha: {
        timeout: 300000,
    },
    etherscan: {
        apiKey: argv.etherscan ?? argv.polyscan,
    },
    defender: {
        apiKey: process.env.DEFENDER_API_KEY,
        apiSecret: process.env.DEFENDER_API_SECRET,
    },
    gasReporter: {
        currency: 'USD',
        coinmarketcap: argv.coinmarketcap,
    },
    docgen: {
        pages: (item, file) => (file.absolutePath.startsWith('contracts') ? relative('contracts', file.absolutePath).replace('.sol', '.md') : undefined),
    },
};

const accountsForNetwork = (name) => [argv[`${name}Mnemonic`] && { mnemonic: argv[`${name}Mnemonic`] }, argv[`${name}PrivateKey`] && [argv[`${name}PrivateKey`]]].find(Boolean);

Object.assign(
    module.exports.networks,
    Object.fromEntries(
        ['mainnet', 'ropsten', 'rinkeby', 'goerli', 'kovan', 'polygon', 'mumbai', 'local']
            .map((name) => [name, { url: argv[`${name}Node`], accounts: accountsForNetwork(name) }])
            .filter(([, { url }]) => url)
    ),
    argv.slow && { hardhat: { mining: { auto: false, interval: [3000, 6000] } } }, // Simulate a slow chain locally
    argv.fork && { hardhat: { forking: { url: argv.forkNode, block: argv.blockNumber } } } // Simulate a mainnet fork
);
