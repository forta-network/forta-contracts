const fs = require('fs');
require('dotenv').config();
const { AdminClient } = require('defender-admin-client');
const defenderAdmin = new AdminClient({
    apiKey: process.env.DEFENDER_API_KEY,
    apiSecret: process.env.DEFENDER_SECRET_KEY,
});
const jsyaml = require('js-yaml');
const { ethers } = require('ethers');

const call = require('./call');

async function main() {
    const proposalFile = jsyaml.load(fs.readFileSync(process.argv[2], 'utf8'));
    // console.log(JSON.stringify(proposalFile));
    if (proposalFile.config.batch != true) {
        // create individual proposals
        for (let i = 0; i < proposalFile.proposals.length; i++) {
            const proposal = proposalFile.proposals[i];
            await propose(proposalFile.config, proposal);
        }
    } else {
        // create one batch proposal
        await batchPropose(proposalFile.config, proposalFile.proposals);
    }
}

async function batchPropose(config, proposals) {
    const network = config.network;
    const contracts = {};
    const steps = [];
    // create steps for batch proposal
    for (const proposal of proposals) {
        const { func, inputs } = getCall(proposal);
        const contractName = proposal.contract;
        const contractAddress = config.contracts[contractName];
        steps.push({
            contractId: `${network}-${contractAddress}`,
            targetFunction: func,
            functionInputs: inputs,
            type: 'custom',
        });
        contracts[contractAddress] = {
            address: contractAddress,
            name: contractName,
            network,
            abi: JSON.stringify(call.getABI(contractName)),
        };
    }
    // create batch proposal
    const result = await defenderAdmin.createProposal({
        contract: Object.keys(contracts).map((key) => contracts[key]),
        title: config.title,
        description: config.description,
        type: 'batch',
        via: config.signer.address,
        viaType: config.signer.type,
        metadata: {}, // required field but empty
        steps,
    });
    console.log(result.url);
}

async function propose(config, proposal) {
    const { func, inputs } = getCall(proposal);
    const proposalParams = {
        contract: {
            address: config.contracts[proposal.contract],
            network: config.network,
        },
        title: proposal.title,
        description: proposal.description,
        type: 'custom',
        functionInterface: func,
        functionInputs: inputs,
        via: config.signer.address,
        viaType: config.signer.type,
    };
    const result = await defenderAdmin.createProposal(proposalParams);
    console.log(`${proposal.title}: ${result.url}`);
}

function getCall(proposal) {
    const { args } = proposal;
    switch (proposal.type) {
        case 'deploy':
            if (!args.initArgs.maxNumberOfKeys) {
                args.initArgs.maxNumberOfKeys = ethers.constants.MaxUint256.toString();
            }
            return call.createUpgradeableLockAtVersion(args.initArgs, args.version);

        case 'updateKeyPricing':
            return call.updateKeyPricing(args.keyPrice, args.tokenAddress);

        case 'withdraw':
            return call.withdraw(args.tokenAddress, args.recipient, args.amount);

        case 'addLockManager':
            return call.addLockManager(args.address);

        case 'grantKeys':
            return call.grantKeys(args.recipients, args.expirationTimestamps, args.keyManagers);

        case 'updateLockConfig':
            return call.updateLockConfig(args.expirationDuration, args.maxNumberOfKeys, args.maxNumberOfKeysPerUser);

        case 'expireAndRefundFor':
            return call.expireAndRefundFor(args.tokenId, args.refundAmount);

        case 'grantKeyExtension':
            return call.grantKeyExtension(args.tokenId, args.duration);

        default:
            throw `unknown proposal type ${proposal.type}`;
    }
}

main().then(() => {
    console.log('successfully created the proposal(s)!');
});
