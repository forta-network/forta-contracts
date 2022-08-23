const { ethers } = require('hardhat');
const DEBUG = require('debug')('forta');
const utils = require('./utils');
const fs = require('fs');
const _ = require('lodash');

const ADDRESS = '0x15d3c7e811582Be09Bb8673cD603Bb2F22D1e47B';
const SUBJECT_TYPE = 0;
const SHARE_TYPE = 'inactive';

const exclusion = [
    '0x52bb254898620Fb3F75956Cf6EC00131e48B7Aed',
    '0x51aba8325C911f30fABf60c04bc3b9407F4bCF83',
    '0x39aEa58a1A021f802d79025335Dd180441512F26',
    '0x5760983a37a4492cC2dd6Eb3F162Ec9ed2a9Fce2',
    '0xeB2030c200B8f9bad5dCB476F1E169612A02bEF6',
    '0xbDc6ac6A80e579A91D580b855BaF56D78da52d74',
    '0x2Dc5503Eac6C469304066ACAcF0a74f8257bcF9E',
    '0x9D11Ad0FF6d8cEae38370DeF0C6e36541C8f8f1c',
    '0xCeE2d25E70ED308606a16F39E617ab2E485D5450',
    '0x3DC45b47B7559Ca3b231E5384D825F9B461A0398',
    '0xe56e69334A82011379E461d216B7733B9bD745BF',
    '0xE870840564d7395CC0f267F23CD85Fa498b07a58',
    '0x91DE4c633B93C13CC7C5e23D306CD8Cf79461e79',
    '0x4d0d2477287C53EBD099ca5e5E5ffcAe18aa31Ef',
    '0x556f8BE42f76c01F960f32CB1936D2e0e0Eb3F4D',
    '0x8903C3C82F99574f677c099a9bAC852E228cF422',
    '0x453Ee833666E414DbC4C9b93EA1763A142fBcD6D',
    '0x29B8A3FA2337cadf2987D40Ea478bB7Ff22dE6EF',
    '0x0fEFe9cCe526db1b310C40DdE1f87C8882c7b6f9',
    '0x7A60D417ea2460076F805729f83Be9395813Ba5f',
    '0x58ee631AAef6882A392da1c25486eE181fF1B7D5',
    '0xAdc4F36654515dB4b97fe0E2aCF41dD034045301',
    '0xe42D959078FCdB147b86F095569A35259da0D3C9',
    '0x0Af3a1C815352ecC83DaDD679e9528fdD7FBC38e',
    '0x9e261BfE273380AC57a42e655A31B49dEDc24CFf',
    '0xd4424c1F139B777f27B72ae854A7f0a7fFCA15A4',
    '0x03D9CF460F8b17908C31Fe3A63d98aCE1fA223C4',
    '0xb554C5c6BDAa4Fa81DeAeBF59BEbA9163f55ceD5',
    '0xCAF8cf856302ce8E6bAa98669cbfa2738105e86D',
    '0xcfFC62c057c8A6FB6c09Ad64f51c9589F1bc6886',
].map((x) => x.toLowerCase());

async function getSharesFor(config = {}) {
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

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`Checking ownership of: ${ADDRESS}`);
    DEBUG(`Share type: ${SHARE_TYPE}`);

    DEBUG(await CACHE.get('staking.address'));
    DEBUG('----------------------------------------------------');

    const shares = require(`./data/${chainId}-share-ids.json`);

    const contracts =
        config.contracts ??
        (await Promise.all(
            Object.entries({
                //agents: utils.attach('AgentRegistry',  await CACHE.get('agents.address')  ).then(contract => contract.connect(deployer)),
                // scanners: utils.attach('ScannerRegistry',await CACHE.get('scanners.address')  ).then(contract => contract.connect(deployer)),
                staking: utils.attach('FortaStaking', await CACHE.get('staking.address')).then((contract) => contract.connect(deployer)),
            }).map((entry) => Promise.all(entry))
        ).then(Object.fromEntries));

    const data = shares.map((item) => {
        const shareId = SHARE_TYPE == 'active' ? item.activeSharesId : item.inactiveSharesId;
        return {
            registryId: item.subject,
            shareId: shareId,
            call: contracts.staking.interface.encodeFunctionData('balanceOf', [ADDRESS, shareId]),
        };
    });
    const idChunks = [];
    const balances = await Promise.all(
        data
            .map((x) => [x.registryId, x.shareId, x.call])
            .chunk(50)
            .map((chunk) => {
                idChunks.push(chunk.map((x) => [x[0], x[1]]));
                const calls = chunk.map((x) => x[2]);
                return contracts.staking.callStatic.multicall(calls);
            })
    );

    const allShares = _.zip(idChunks.flat(), balances.flat());
    console.log('allShares', allShares.length);
    DEBUG(allShares);
    const ownedByAddress = allShares.filter((x) => ethers.BigNumber.from(x[1]).gt(ethers.BigNumber.from(0)));

    console.log('ownedByAddress', ownedByAddress.length);
    DEBUG(ownedByAddress);

    const results = {
        // ownedByAddress: _.uniq(ownedByAddress),
        subjectIdsAndAmounts: allShares
            .map((x) => {
                return {
                    id: ethers.utils.hexZeroPad(ethers.utils.hexValue(ethers.BigNumber.from(x[0][0]), 20)),
                    amount: ethers.utils.formatEther(ethers.BigNumber.from(x[1])),
                };
            })
            .map((x) => {
                return {
                    ...x,
                    id: ethers.utils.hexZeroPad(x.id, 20),
                };
            })
            .filter((x) => ethers.utils.parseEther(x.amount).gt(ethers.BigNumber.from(0))),
        //.filter((item) => !exclusion.find((x) => x === item.id.toLowerCase())),
        subjectIds: ownedByAddress.map((x) => ethers.utils.hexValue(ethers.BigNumber.from(x[0][0]), 20)).map((x) => ethers.utils.hexZeroPad(x, 20)),
        //.filter((item) => !exclusion.find((x) => x === item.toLowerCase())),
    };
    results.subjectIdsAndAmounts = _.uniqBy(results.subjectIdsAndAmounts, 'id');
    results.subjectIds = _.uniq(results.subjectIds);

    const fileName = `./scripts/data/${SHARE_TYPE == 'inactive' ? 'in' : ''}active_shares_${ADDRESS}.json`;
    fs.writeFileSync(fileName, JSON.stringify(results));
    console.log('Saved to: ', fileName);
}

if (require.main === module) {
    getSharesFor()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = getSharesFor;
