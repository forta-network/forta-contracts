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
    for (let i = 0; i < proposalFile.proposals.length; i++) {
        const proposal = proposalFile.proposals[i];
        await propose(proposalFile.config, proposal);
    }
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

        default:
            throw `unknown proposal type ${proposal.type}`;
    }
}

main().then(() => {
    console.log('successfully created the proposal(s)!');
});
