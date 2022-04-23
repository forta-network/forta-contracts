const { constants } = require('ethers')
const { ethers } = require('hardhat');
const parseEther = ethers.utils.parseEther;
const DEBUG                = require('debug')('forta');
const utils                = require('./utils');
const fs = require('fs');

const STAKE_AMOUNT = parseEther('500')
const SUBJECT_IDS = [
    '0x9d11ad0ff6d8ceae38370def0c6e36541c8f8f1c',
    '0x453ee833666e414dbc4c9b93ea1763a142fbcd6d',
    '0xcee2d25e70ed308606a16f39e617ab2e485d5450',
    '0x8903c3c82f99574f677c099a9bac852e228cf422',
    '0x4d0d2477287c53ebd099ca5e5e5ffcae18aa31ef',
    '0x7a60d417ea2460076f805729f83be9395813ba5f',
    '0xbdc6ac6a80e579a91d580b855baf56d78da52d74',
    '0xe56e69334a82011379e461d216b7733b9bd745bf',
    '0x91de4c633b93c13cc7c5e23d306cd8cf79461e79',
    '0x29b8a3fa2337cadf2987d40ea478bb7ff22de6ef',
    '0x2dc5503eac6c469304066acacf0a74f8257bcf9e',
    '0x3dc45b47b7559ca3b231e5384d825f9b461a0398',
    '0x556f8be42f76c01f960f32cb1936d2e0e0eb3f4d',
    '0xe870840564d7395cc0f267f23cd85fa498b07a58',
    '0x0fefe9cce526db1b310c40dde1f87c8882c7b6f9',
    '0xeb2030c200b8f9bad5dcb476f1e169612a02bef6'
]
const SUBJECT_TYPE=0
const MULTISIG='0x8ba1f109551bD432803012645Ac136ddd64DBA72'


Array.range = function(start, stop = undefined, step = 1) {
    if (!stop) { stop = start; start = 0; }
    return start < stop ? Array(Math.ceil((stop - start) / step)).fill().map((_, i) => start + i * step) : [];
}

Array.prototype.chunk = function(size) {
    return Array.range(Math.ceil(this.length / size)).map(i => this.slice(i * size, i * size + size))
}


async function stakeAll(config = {}) {
    const provider = config.provider ?? await utils.getDefaultProvider();
    const signer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    let configName;
    if (chainId === 5) {
        configName = chainId === 5 ? '.cache-5-with-components' : `.cache-${chainId}`;
    } else {
        if (chainId === 1) {
            throw new Error('Mainnet not supported');
        }
        configName = `.cache-${chainId}`;
    }
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: configName });
    const fortaContract = chainId === 137 || chainId === 80001 ? 'FortaBridgedPolygon' : 'Forta'

    DEBUG(`fortaContract:  ${fortaContract}`);
    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`signer: ${signer.address}`);
    DEBUG('----------------------------------------------------');
    
    const contracts = config.contracts ?? await Promise.all(Object.entries({
        forta: utils.attach(fortaContract,  await CACHE.get('forta.address') ).then(contract => contract.connect(signer)),
        access: utils.attach('AccessManager',  await CACHE.get('access.address') ).then(contract => contract.connect(signer)),
        //agents: utils.attach('AgentRegistry',  await CACHE.get('agents.address')  ).then(contract => contract.connect(signer)),
        scanners: utils.attach('ScannerRegistry',await CACHE.get('scanners.address')  ).then(contract => contract.connect(signer)),
        staking: utils.attach('FortaStaking',await CACHE.get('staking.address')  ).then(contract => contract.connect(signer)),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries);

    const totalAmount = STAKE_AMOUNT.mul(SUBJECT_IDS.length)
    console.log('need to stake:', SUBJECT_IDS.length, totalAmount.toString());
    if (chainId === 31337) {
        DEBUG('whitelisting..')
        await contracts.forta.grantRole(ethers.utils.id('WHITELISTER_ROLE'), signer.address)
        await contracts.forta.grantRole(ethers.utils.id('WHITELIST_ROLE'), signer.address)
        await contracts.forta.grantRole(ethers.utils.id('WHITELIST_ROLE'), contracts.staking.address)
        await contracts.forta.grantRole(ethers.utils.id('MINTER_ROLE'), signer.address)
        await contracts.access.grantRole(ethers.utils.id('SCANNER_ADMIN_ROLE'), signer.address)
        DEBUG('whitelisted')
        DEBUG('minting...')

        await contracts.forta.mint(signer.address, totalAmount.toString())
        DEBUG('minted')
        DEBUG('set threshold...')

        await contracts.scanners.setStakeThreshold(
            { min: STAKE_AMOUNT.toString(), max: STAKE_AMOUNT.mul(5).toString(), activated: true}
            , 1
        )
        DEBUG('set threshold')
        DEBUG('register...')
        const registrationsCalls = await (await Promise.all(SUBJECT_IDS.map(id => contracts.scanners.isRegistered(id).then(exists => [exists, id]))))
            .filter(toRegister => !toRegister[0])
            .map(toRegister => contracts.scanners.interface.encodeFunctionData('adminRegister', [
                toRegister[1], signer.address, 1, `metadata-${toRegister[1]}`
            ]))
        DEBUG('Registering ', registrationsCalls.length)

        const registrationReceipts = await Promise.all(
            registrationsCalls
            .chunk(8)
            .map(chunk => {
                DEBUG('chunk', chunk.length)
                return contracts.scanners.multicall(chunk).then(tx => tx.wait())
            }))
        
        DEBUG('register.')
        
    }

    const balance = await contracts.forta.balanceOf(signer.address)
    console.log('balance', balance.toString())
    if (balance.lt(totalAmount)) {
        throw new Error('Insufficient balance');
    }

    const allowance = await contracts.forta.allowance(signer.address, contracts.staking.address);
    console.log('allowance', allowance.toString());
    
    if (totalAmount.gt(allowance)) {
        console.log('Approving Fort...');
        const approvalTx = await contracts.forta.connect(signer).approve(contracts.staking.address, totalAmount.toString());
        await approvalTx.wait();
        console.log('Approved.');
    }

    DEBUG('staking...')
    const stakingCalls = await (await Promise.all(SUBJECT_IDS.map(id => contracts.scanners.isStakedOverMin(id).then(staked => [staked, id]))))
        .filter(toStake => !toStake[0])
        .map(toStake => contracts.staking.interface.encodeFunctionData('deposit', [
            SUBJECT_TYPE, toStake[1], STAKE_AMOUNT
        ]))
    DEBUG('staking ', stakingCalls.length)

    const stakingReceipts = await Promise.all(
        stakingCalls
        .chunk(8)
        .map(chunk => {
            DEBUG('chunk', chunk.length)
            return contracts.staking.multicall(chunk).then(tx => tx.wait())
        }))
    
    DEBUG('staked.')

    const ids = stakingReceipts
        .map(receipt => receipt.events.filter(event => event.event === 'TransferSingle').map(event => event.args.id))
        .reduce(
            (prev, current) => prev.concat(current),
            []
        ).map(id => id.toString());
    const amounts = ids.slice().fill(STAKE_AMOUNT.toString())
    console.log(ids)
    console.log(amounts)
    const transfer = await contracts.staking.safeBatchTransferFrom(signer.address, MULTISIG, ids, amounts, '0x')
    const { events } = await transfer.wait()
    console.dir(events)


}

if (require.main === module) {
    stakeAll()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = stakeAll;

