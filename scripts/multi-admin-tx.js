const { ethers } = require('hardhat');
const _ = require('lodash');
const Safe =  require("@gnosis.pm/safe-core-sdk").default
const EthersAdapter = require('@gnosis.pm/safe-ethers-lib').default
const SafeServiceClient = require("@gnosis.pm/safe-service-client").default
const utils                = require('./utils');
const DEBUG                = require('debug')('forta');
const axios = require('axios');

const rewardables = require('./data/rewards_result.json').slice(0,100)

const FORTA_TOKEN_NAME = {
    1: 'Forta',
    4: 'Forta',
    5: 'Forta',
    80001: 'FortaBridgedPolygon',
    137: 'FortaBridgedPolygon',

}

const MULTISIG= {
    1:  {
        address: process.env.MAINNET_MULTISIG,
        txService: process.env.MAINNET_GNOSIS_TX_SERVICE
    },
    4:  {
        address: process.env.RINKEBY_MULTISIG,
        txService: process.env.RINKEBY_GNOSIS_TX_SERVICE
    },
    5:  {
        address: process.env.GOERLI_MULTISIG,
        txService: process.env.GOERLI_GNOSIS_TX_SERVICE
    },
    137:  {
        address: process.env.POLYGON_MULTISIG,
        txService: process.env.POLYGON_GNOSIS_TX_SERVICE
    },
}

const getEip3770Address = (chainId, address) => {
    switch(chainId) {
        case 1:
            return `eth:${address}`
        case 4:
            return `rin:${address}`
        case 137:
            return `pol:${address}`
    }
}


async function main() {
    const provider = config.provider ?? await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    let configName;
    if (chainId === 5) {
        configName = chainId === 5 ? './_old/.cache-5-with-components' : `.cache-${chainId}`;
    } else {
        configName = `.cache-${chainId}`;
    }
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: configName });

    const contracts = config.contracts ?? await Promise.all(Object.entries({
        forta: utils.attach(FORTA_TOKEN_NAME[chainId], await CACHE.get('forta.address')).then(contract => contract.connect(deployer)),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries)



    DEBUG(`Network:  ${name} (${chainId})`)
    DEBUG(`Deployer: ${deployer.address}`)

    DEBUG('----------------------------------------------------')

    const ethAdapter = new EthersAdapter({
        ethers,
        signer: deployer
    })

    console.log('Rewardables:', rewardables.length)

    const WHITELIST_ROLE = ethers.utils.id('WHITELIST_ROLE');

    const owners = []
    const whitelisted = await Promise.all(
        rewardables.chunk(1)
        .map(async chunk => {
            owners.push(chunk.map(x => x.owner))
            return await Promise.all(
                chunk.map(x => contracts.forta.hasRole(WHITELIST_ROLE, x.owner))
            )
        }))
    const notWhitelisted = _.zip(whitelisted.flat(), owners.flat()).filter(x => !x[0]).map(x => x[1])


    console.log('Not whitelisted:', notWhitelisted.length)
    const safeAddress = MULTISIG[chainId].address

    const safeSdk = await Safe.create({ ethAdapter, safeAddress })

    const transactions = await Promise.all(
        notWhitelisted.map(async x => {
            const unsignedTransaction = await contracts.forta.populateTransaction.grantRole(WHITELIST_ROLE, x)
            return {
                to: contracts.forta.address,
                value: "0",
                data: unsignedTransaction.data
            }
        })
    )

    const safeTransaction = await safeSdk.createTransaction(transactions)

    console.log("Created safe transaction")
    DEBUG(safeTransaction)

    const safeTxHash = await safeSdk.getTransactionHash(safeTransaction)

    console.log("Retrieved safe transaction hash")
    console.log(MULTISIG[chainId].address)
    console.log(deployer.address)
    console.log(safeTxHash)
    

	//const signature = await safeSdk.signTransactionHash(txHash);

	const safeService = new SafeServiceClient('https://safe-transaction.rinkeby.gnosis.io');

    const result = await safeService.proposeTransaction(safeAddress, deployer.address,safeTransaction,safeTxHash, 'script')
    console.log(result)

    //const signature = await safeSdk.signTransactionHash(safeTxHash)
    //await safeService.confirmTransaction(safeTxHash, signature.data)
	//const signature = await safeSdk.signTransactionHash(safeTxHash);
    console.log(safeTransaction)
    //console.log(signature)

	

    console.log("Confirmed signature")
    DEBUG(signature)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })