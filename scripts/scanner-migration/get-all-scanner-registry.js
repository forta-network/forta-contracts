const { ethers } = require('hardhat');
const utils = require('../utils');
const deployEnv = require('../loadEnv');
const fs = require('fs');

const dates = {
    80001: { initial: 1646067669, end: 1669197142 }, // These are timestamps, should be blocks now.
    //137: { initial: 20187154, end: 36012715 },
    137: { initial: 20348378, end: 36012715 },
};

async function main() {
    const { provider, deployer, network, contracts } = await deployEnv.loadEnv();
    console.log(`Network:  ${network.name} ${network.chainId}`);
    console.log(`Deployer: ${deployer.address}`);
    console.log('----------------------------------------------------');

    const filters = {};
    filters['scannerMinting'] = contracts.scanners.filters.ScannerUpdated();
    const step = 100000;
    for (let i = dates[network.chainId].initial; i <= dates[network.chainId].end; i += step) {
        console.log(`Scanning from ${i} to ${i + step}`);
        const start = i;
        const end = i + step;
        const scannerLogs = await utils.getLogsForBlockInterval(start, end, contracts.scanners, filters);
        console.log(scannerLogs);
        if (scannerLogs.scannerMinting.length !== 0) {
            let scannerData = await Promise.all(
                scannerLogs.scannerMinting.map(async (log) => {
                    const id = ethers.utils.hexZeroPad(ethers.utils.hexValue(log.args.scannerId), 20);
                    return {
                        blockNumber: log.blockNumber,
                        timestamp: new Date((await provider.getBlock(log.blockNumber)).timestamp).toUTCString(),
                        id: id,
                        chainId: ethers.BigNumber.from(log.args.chainId).toString(),
                        owner: await contracts.scanners.ownerOf(id),
                        metadata: log.args.metadata,
                    };
                })
            );
            console.log(scannerData);
            fs.writeFileSync(`./scripts/data/scanners/${network.name}/from_${dates[network.chainId].initial}_to_${dates[network.chainId].end}.json`, scannerData);
        } else {
            console.log('skip');
        }
    }

    /*
    const raw = [
        {
            blockNumber: 25326111,
            timestamp: 'Tue, 20 Jan 1970 01:15:03 GMT',
            id: '0x3f88c2b3e267e6b8e9de017cdb47a59ac9ecb284',
            chainId: '1',
            owner: '0x8eedf056dE8d0B0fd282Cc0d7333488Cc5B5D242',
        },
        {
            blockNumber: 25374380,
            timestamp: 'Tue, 20 Jan 1970 01:20:00 GMT',
            id: '0x9dc6b3679df5d3327612d6882680f22f984c5f24',
            chainId: '1',
            owner: '0x8eedf056dE8d0B0fd282Cc0d7333488Cc5B5D242',
        },
        {
            blockNumber: 25620337,
            timestamp: 'Tue, 20 Jan 1970 01:46:01 GMT',
            id: '0x233bac002bf01da9feb9de57ff7de5b3820c1a24',
            chainId: '0',
            owner: '0x233BAc002bF01DA9FEb9DE57Ff7De5B3820C1a24',
        },
        {
            blockNumber: 25620818,
            timestamp: 'Tue, 20 Jan 1970 01:46:03 GMT',
            id: '0x233bac002bf01da9feb9de57ff7de5b3820c1a24',
            chainId: '1',
            owner: '0x233BAc002bF01DA9FEb9DE57Ff7De5B3820C1a24',
        },
        {
            blockNumber: 25731774,
            timestamp: 'Tue, 20 Jan 1970 01:57:35 GMT',
            id: '0x347afef038bed6b713ca4ed141aac6b128aa2ba3',
            chainId: '1',
            owner: '0x8eedf056dE8d0B0fd282Cc0d7333488Cc5B5D242',
        },
        {
            blockNumber: 26379620,
            timestamp: 'Tue, 20 Jan 1970 03:09:35 GMT',
            id: '0xfc05bb916527aa11484ae935eb84d5ee815fbad5',
            chainId: '1',
            owner: '0x9924d7dB0FADc1B2c5D1Ad431369307c8e5Cf21F',
        },
        {
            blockNumber: 26379627,
            timestamp: 'Tue, 20 Jan 1970 03:09:35 GMT',
            id: '0xc58c2ea1abb80b7a58c2ae8818b1ba494302fb85',
            chainId: '1',
            owner: '0x8849dbb6b673Dc87De4318CC5414f5cA2B792D71',
        },
        {
            blockNumber: 26379630,
            timestamp: 'Tue, 20 Jan 1970 03:09:35 GMT',
            id: '0x5e644af147d377d79718217c484760814fe73843',
            chainId: '1',
            owner: '0x5dcdFA64dd800dF47224Dfa47Faffa9e2Ab24358',
        },
        {
            blockNumber: 26812048,
            timestamp: 'Tue, 20 Jan 1970 03:53:46 GMT',
            id: '0xdeadbed148a5a6a345b399d6a386c36d8a416c63',
            chainId: '1',
            owner: '0xAAA8C491232CB65A65fBF7F36b71220b3E695Aaa',
        },
        {
            blockNumber: 26825761,
            timestamp: 'Tue, 20 Jan 1970 03:55:07 GMT',
            id: '0x5774db596c29a0b5b8729083ec1f69cb3e187772',
            chainId: '1',
            owner: '0xdeadbEd148A5A6a345B399D6a386c36d8A416C63',
        },
        {
            blockNumber: 28808332,
            timestamp: 'Tue, 20 Jan 1970 06:58:44 GMT',
            id: '0xfdf08066d28b221604a671106d67d6215c6603fb',
            chainId: '137',
            owner: '0x874B5d427b2d27F6Ea0ed3BCE4De454824AEC9cC',
        },
        {
            blockNumber: 28808454,
            timestamp: 'Tue, 20 Jan 1970 06:58:45 GMT',
            id: '0xce46cd6748adf0736b1f7550231df88046ee9a58',
            chainId: '1',
            owner: '0x874B5d427b2d27F6Ea0ed3BCE4De454824AEC9cC',
        },
    ];
    const grouped = {};

    for (const scanner of raw) {
        if (!grouped[scanner.chainId]) {
            grouped[scanner.chainId] = {};
        }
        if (!grouped[scanner.chainId][scanner.owner]) {
            grouped[scanner.chainId][scanner.owner] = {};
        }
        grouped[scanner.chainId][scanner.owner][scanner.id] = scanner;
    }
    const data = JSON.stringify({ grouped, raw: raw }, null, 2);*/
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
