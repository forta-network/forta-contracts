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

function getRepeated() {
    return require('./data/repeated_week3.json');
    /*
    let funnel = csvToJson.fieldDelimiter(',').getJsonFromCsv('./scripts/data/repeated_week3.csv');
    const nodes = funnel
        .map((x) => {
            // console.log(x);
            return {
                owner: x.owner.toLowerCase(),
                amount: parseEther(x['fort']).toString(),
                tokenId: x.TokenID.startsWith('https://') ? 'multiple' : x.TokenID,
            };
        })
        .map((x) => {
            return {
                ...x,
            };
        });
    fs.writeFileSync('./scripts/data/repeated_week4.json', JSON.stringify(nodes));
    return nodes;*/
}

const totalAmountFor = (bunch) => bunch.reduce((prev, next) => prev.add(next.amount), ethers.BigNumber.from(0));

async function main() {

    const rewards = getRewardableNodes();
    console.log(rewards)
    console.log('Rewardable Nodes:', rewards.length);

    const repeated = getRepeated();
    console.log(repeated)
    const repeatedOneNode = repeated.filter((x) => x.tokenId !== 'multiple');
    const repeatedMultiple = repeated.filter((x) => x.tokenId === 'multiple');
    const result = { oneNode: {}, multiple: {} };

    repeatedOneNode.forEach((x) => {
        const sameTokenIds = rewards.filter((reward) => {
            return x.tokenId === reward.tokenId;
        });
        !result.oneNode[x.tokenId] ? (result.oneNode[x.tokenId] = { rewards: [], repeated: [] }) : null;
        result.oneNode[x.tokenId].rewards = sameTokenIds;
        result.oneNode[x.tokenId].repeated = [...result.oneNode[x.tokenId].repeated, x];
        result.oneNode[x.tokenId].amount = totalAmountFor(result.oneNode[x.tokenId].rewards).sub(totalAmountFor(result.oneNode[x.tokenId].repeated)).toString();
    });
    Object.keys(result.oneNode).forEach((tokenId) => {
        result.oneNode[tokenId].amount = totalAmountFor(result.oneNode[tokenId].rewards).sub(totalAmountFor(result.oneNode[tokenId].repeated)).toString();
    });

    repeatedMultiple.forEach((x) => {
        const rewardsWeek4 = rewards.filter((reward) => x.owner === reward.owner);
        !result.multiple[x.owner] ? (result.multiple[x.owner] = { rewards: [], repeated: [] }) : null;
        result.multiple[x.owner].rewards = [...result.multiple[x.owner].rewards, ...rewardsWeek4];
        result.multiple[x.owner].repeated = [...result.multiple[x.owner].repeated, x];
    });

    Object.keys(result.multiple).forEach((owner) => {
        result.multiple[owner].amount = totalAmountFor(result.multiple[owner].rewards).sub(totalAmountFor(result.multiple[owner].repeated)).toString();
    });

    fs.writeFileSync('./scripts/data/repeated_accounting.json', JSON.stringify(result));
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
