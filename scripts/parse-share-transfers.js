const fs = require('fs');
const _ = require('lodash');

const { ethers } = require('hardhat');
const { BigNumber } = ethers;
const parseEther = ethers.utils.parseEther;
const DEBUG = require('debug')('forta');
const utils = require('./utils');
const stakingUtils = require('./utils/staking.js');
let csvToJson = require('convert-csv-to-json');

function getRewardableNodes() {
    return require('./data/rewards_week4_result.json').map((x) => {
        return { ...x, owner: x.owner.toLowerCase() };
    });
}

async function main() {

    const rewards = getRewardableNodes();
    const result = _.chunk(rewards, 30);
    console.log(result)
    fs.writeFileSync('./scripts/data/share_tx_week_4.json', JSON.stringify(result));
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;
