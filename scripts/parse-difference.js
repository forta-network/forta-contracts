const fs = require('fs');

const { ethers } = require('hardhat');
const { BigNumber } = ethers;
const { formatEther } = ethers.utils;
//const DEBUG = require('debug')('forta');
//const utils = require('./utils');
const expected = require('./data/rewards_week3_result.json');
const sent = require('./data/sent_week3_2.json');

function findDuplicates(input) {
    const duplicates = input.filter((e, i, a) => a.indexOf(e) !== i);
    console.log('Duplicates');
    console.log(duplicates);
    console.log(duplicates.length);
}

async function main() {
    console.log('sent');
    console.log(sent.length);
    const amountSent = sent.reduce((prev, next) => prev.add(ethers.BigNumber.from(next.amount)), ethers.BigNumber.from('0'));
    const sentIds = sent.map((x) => `${x.receiver}_${x.amount}`);
    console.log(ethers.utils.formatEther(amountSent));
    findDuplicates(sentIds);

    console.log('expected');
    console.log(expected.length);
    const amountExpected = expected.reduce((prev, next) => prev.add(ethers.BigNumber.from(next.rewardsFort)), ethers.BigNumber.from('0'));
    const expectedIds = expected.map((x) => `${x.owner}_${x.rewardsFort}`);

    console.log(ethers.utils.formatEther(amountExpected));
    findDuplicates(expectedIds);

    let difference = expectedIds.filter((x) => !sentIds.includes(x));
    console.log('difference', difference.length);
    console.log(difference);
    const diffAmount = difference.reduce((prev, next) => prev.add(BigNumber.from(next.replace(/0x.+_/, ''))), BigNumber.from('0'));
    console.log(formatEther(diffAmount));

    const notSentTransactions = difference.map((id) => {
        const amount = id.replace(/0x.+_/, '');
        const owner = id.replace(`_${amount}`, '');
        return {
            owner: owner,
            amount: amount,
        };
    });
    fs.writeFileSync('./scripts/data/not_sent_week3.json', JSON.stringify(notSentTransactions));
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
