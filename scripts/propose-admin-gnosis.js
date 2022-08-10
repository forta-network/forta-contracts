const { ethers } = require('hardhat');
const DEBUG = require('debug')('forta:propose');
const utils = require('./utils');
const fs = require('fs');

const txTemplate = {
    version: '1.0',
    chainId: '',
    createdAt: 0,
    meta: {
        name: 'Transactions Batch',
        description: '',
        txBuilderVersion: '1.8.0',
        createdFromSafeAddress: '',
        createdFromOwnerAddress: '',
        checksum: '',
    },
    transactions: [],
};

// JSON spec does not allow undefined so stringify removes the prop
// That's a problem for calculating the checksum back so this function avoid the issue
const stringifyReplacer = (_, value) => (value === undefined ? null : value);

const serializeJSONObject = (json) => {
    if (Array.isArray(json)) {
        return `[${json.map((el) => serializeJSONObject(el)).join(',')}]`;
    }

    if (typeof json === 'object' && json !== null) {
        let acc = '';
        const keys = Object.keys(json).sort();
        acc += `{${JSON.stringify(keys, stringifyReplacer)}`;

        for (let i = 0; i < keys.length; i++) {
            acc += `${serializeJSONObject(json[keys[i]])},`;
        }

        return `${acc}}`;
    }

    return `${JSON.stringify(json, stringifyReplacer)}`;
};

const calculateChecksum = (batchFile) => {
    const serialized = serializeJSONObject({
        ...batchFile,
        meta: { ...batchFile.meta, name: null },
    });
    const sha = ethers.utils.id(serialized);

    return sha || undefined;
};

async function generateTransactionBatch(configPath) {
    const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    const deployment = require(`./.cache-${chainId}.json`);

    console.log(`Network:  ${name} (${chainId})`);
    console.log(`Deployer: ${deployer.address}`);
    console.log('----------------------------------------------------');

    console.log('Config');
    const config = configPath ? require(configPath) : require('./data/gnosis-proposal-config-1_unstake_fortification.json');
    console.log(config);
    const transaction = { ...txTemplate };
    transaction.description = config.description;
    transaction.chainId = chainId;
    transaction.createdAt = +Date.now();
    transaction.meta.createdFromSafeAddress = config.multisig;

    transaction.transactions = await Promise.all(
        config.methods.map(async (method) => {
            const contractAddress = await deployment[method.contractTag].address;
            const contract = await utils.attach(method.contractName, contractAddress).then((contract) => contract.connect(deployer));
            DEBUG(method.contractTag, contractAddress);
            const fragment = contract.interface.fragments.find((fragment) => fragment.name === method.name);
            DEBUG(fragment);
            const functionInterface = JSON.parse(fragment.format(ethers.utils.FormatTypes.json));
            DEBUG(functionInterface);
            return {
                to: contractAddress,
                value: method.value,
                data: null,
                contractMethod: functionInterface,
                contractInputsValues: method.inputs,
            };
        })
    );
    transaction.meta.checksum = calculateChecksum(transaction);
    DEBUG(transaction);
    fs.writeFileSync(`./scripts/data/gnosis-proposal-${transaction.createdAt}.json`, JSON.stringify(transaction));

    console.log('Saved at', `./scripts/data/gnosis-proposal-${transaction.createdAt}.json`);
}

if (require.main === module) {
    generateTransactionBatch(null)
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = generateTransactionBatch;
