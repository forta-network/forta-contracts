const utils = require('./utils');

const scannerIds = ['0x7Ffac77669A639E1c2073D4A9cBC38BDF323cd8E', '0xAFecdb59f21EF56301C912AadF1AEF1611639Be0', '0x2dB85E8fb922526edE692F77bc704718A4Cf4943'];
let firstTx;

async function main() {
    const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();
    let cacheFile;
    if (chainId === 5) {
        cacheFile = `_old/.cache-5-with-components`;
    } else {
        cacheFile = `.cache-${chainId}`;
    }
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: cacheFile });
    const contracts = await Promise.all(
        Object.entries({
            scanners: utils.attach('ScannerRegistry', await CACHE.get('scanners.address')).then((contract) => contract.connect(deployer)),
        }).map((entry) => Promise.all(entry))
    ).then(Object.fromEntries);

    console.log(`Network:  ${name} (${chainId})`);
    console.log(`Deployer: ${deployer.address}`);
    console.log('----------------------------------------------------');

    firstTx = await CACHE.get('scanners-pending');

    const addToArrayIfExist = (dict, key, value) => {
        dict[key] ? dict[key].push(value) : (dict[key] = [value]);
        return dict;
    };

    const enableEvents = await utils.getEventsFromTx(firstTx, `ScannerEnabled`, contracts.scanners, [scannerIds], provider);
    const enables = enableEvents.reduce(
        (prev, current) => addToArrayIfExist(prev, current.args.scannerId.toHexString(), { blockNumber: current.blockNumber, enabled: current.args.enabled }),
        {}
    );
    for (const scannerId of Object.keys(enables)) {
        enables[scannerId].sort((prev, next) => prev.blockNumber - next.blockNumber);
        enables[scannerId] = enables[scannerId].pop();
    }
    console.log(enables);
    console.log('initial', scannerIds);
    const enabledScanners = scannerIds.filter((id) => enables[id.toLowerCase()] === undefined || enables[id.toLowerCase()].enabled);
    console.log('final', enabledScanners);
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
