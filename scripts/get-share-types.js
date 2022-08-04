const stakingUtils = require('./utils/staking.js');

const SHARE_IDS = [
    '63051652608247346138956912386964262566087265002115663164006756700057509539840',
    '6337365844702309400084716302260025338125856465650785767083354649346546582528',
    '99050038579047722081472362029662902001055019802069199823963888849172082939904',
];

async function getShareTypes(config = {}) {
    const ids = config.shareIds ?? SHARE_IDS;
    const shares = ids
        .map((share) => {
            return {
                shareId: share,
                isActive: stakingUtils.isActive(share),
            };
        })
        .sort((a, b) => (a.isActive ? -1 : 1));
    console.table(shares);
}

if (require.main === module) {
    getShareTypes()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = getShareTypes;
