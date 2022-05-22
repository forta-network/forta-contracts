const { ethers } = require('hardhat');
const DEBUG = require('debug')('forta');
const utils = require('./utils');
const stakingUtils = require('./utils/staking.js');
const fs = require('fs');
const _ = require('lodash');

const ADDRESS = '0x';

async function transferShares(config = {}) {
    const provider = config.provider ?? (await utils.getDefaultProvider());
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    let configName;
    if (chainId === 5) {
        configName = chainId === 5 ? './_old/.cache-5-with-components' : `.cache-${chainId}`;
    } else {
        configName = `.cache-${chainId}`;
    }
    console.log(configName);
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: configName });

    const SUBJECT_TYPE = config.subjectType ?? 0;

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`Checking ownership of: ${ADDRESS}`);
    DEBUG(await CACHE.get('staking.address'));
    DEBUG('----------------------------------------------------');
    const contracts =
        config.contracts ??
        (await Promise.all(
            Object.entries({
                //agents: utils.attach('AgentRegistry',  await CACHE.get('agents.address')  ).then(contract => contract.connect(deployer)),
                // scanners: utils.attach('ScannerRegistry',await CACHE.get('scanners.address')  ).then(contract => contract.connect(deployer)),
                staking: utils.attach('FortaStaking', await CACHE.get('staking.address')).then((contract) => contract.connect(deployer)),
            }).map((entry) => Promise.all(entry))
        ).then(Object.fromEntries));

    let firstTx = config.firstTx ?? (await CACHE.get('staking-pending'));

    const mintings = await utils.getEventsFromTx(firstTx, `StakeDeposited`, contracts.staking, [0, null, ADDRESS, null], provider);

    const data = mintings
        .map((event) => ethers.utils.hexZeroPad(ethers.utils.hexValue(event.args.subject), 20))
        .map((registryId) => {
            return { registryId: registryId, activeShareId: stakingUtils.subjectToActive(SUBJECT_TYPE, registryId) };
        })
        .map((item) => {
            return {
                registryId: item.registryId,
                activeShareId: item.activeShareId.toString(),
                call: contracts.staking.interface.encodeFunctionData('balanceOf', [ADDRESS, item.activeShareId]),
            };
        });
    const idChunks = [];
    const balances = await Promise.all(
        data
            .map((x) => [x.registryId, x.activeShareId, x.call])
            .chunk(20)
            .map((chunk) => {
                idChunks.push(chunk.map((x) => [x[0], x[1]]));
                const calls = chunk.map((x) => x[2]);
                return contracts.staking.callStatic.multicall(calls);
            })
    );

    console.log('idChunks', idChunks.length);
    console.log('balances', balances.length);
    const allShares = _.zip(idChunks.flat(), balances.flat());
    console.log('allShares', allShares.length);
    const ownedByAddress = allShares.filter((x) => ethers.BigNumber.from(x[1]).gt(ethers.BigNumber.from(0)));
    console.log('allShares', ownedByAddress.length);

    const results = {
        ownedByAddress: ownedByAddress,
        idsAndAmounts: ownedByAddress.map((x) => [x[0][0], x[1]]),
        ids: ownedByAddress.map((x) => x[0][0]),
    };
    fs.writeFileSync(`./scripts/data/active_shares_${ADDRESS}.json`, JSON.stringify(results));
}

if (require.main === module) {
    transferShares()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = transferShares;
