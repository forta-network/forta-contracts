require('dotenv/config');
require('@nomiclabs/hardhat-ethers');
require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-etherscan');
require('solidity-coverage');
require('hardhat-gas-reporter');
require('@openzeppelin/hardhat-upgrades');
//require("@openzeppelin/hardhat-defender");

const argv = require('yargs/yargs')().env('').argv;

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
            runs: 999,
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
};

const accountsForNetwork = (name) => [
    argv[`${name}Mnemonic`]   && { mnemonic: argv[`${name}Mnemonic`]   },
    argv[`${name}PrivateKey`]   && [ argv[`${name}PrivateKey`] ],
  ].find(Boolean)



Object.assign(
  module.exports.networks,
  Object.fromEntries([
    'mainnet',
    'ropsten',
    'rinkeby',
    'goerli',
    'kovan',
    'polygon',
    'mumbai',
  ].map(name => [ name, { url: argv[`${name}Node`], accounts: accountsForNetwork(name) } ]).filter(([, { url} ]) => url)),
  argv.slow && { hardhat: { mining: { auto: false, interval: [3000, 6000] }}}, // Simulate a slow chain locally
  argv.fork && { hardhat: { forking: { url: argv.forkNode, block: argv.blockNumber }}}, // Simulate a mainnet fork
);
