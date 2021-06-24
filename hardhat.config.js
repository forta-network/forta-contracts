require('@nomiclabs/hardhat-ethers');
require('@nomiclabs/hardhat-waffle');
require('solidity-coverage');
require('@openzeppelin/hardhat-upgrades');

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    compilers: [
      {
        version: '0.8.6',
        settings: {
          optimizer: {
            enabled: true,
            runs: 999,
          },
        },
      },
    ],
  },
  networks: {},
};

module.hardhat = {
  mining: {
    auto: false,
    interval: [3000, 6000],
  },
};

if (process.env.RINKEBY_NODE && process.env.MNEMONIC) {
  module.exports.networks.rinkeby = {
    url: process.env.RINKEBY_NODE,
    accounts: [ process.env.MNEMONIC ],
  };
}

if (process.env.GOERLI_NODE && process.env.MNEMONIC) {
  module.exports.networks.goerli = {
    url: process.env.GOERLI_NODE,
    accounts: [ process.env.MNEMONIC ],
  };
}
