const { ethers } = require('hardhat');
const stakingUtils = require('./utils/staking.js');

const IDS = [
    "0x9Ca49B4A151cec4AEDB01aB9A09D092F814DA7f8",
];
const SUBJECT_TYPE = 0;

async function main() {
    IDS.forEach((id) => {
        console.log(id, '-->', ethers.utils.hexValue(stakingUtils.subjectToActive(SUBJECT_TYPE, id)));
    });
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
