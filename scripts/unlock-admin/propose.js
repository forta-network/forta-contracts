const { AdminClient } = require('defender-admin-client');
const defenderAdmin = new AdminClient({ apiKey: process.env.DEFENDER_API_KEY, apiSecret: process.env.DEFENDER_API_SECRET });
const jsyaml = require('js-yaml');

const call = require('./call');

async function main() {
    const proposalFile = jsyaml.load(process.argv[2]);
    for (let i = 0; i < proposalFile.proposals.length; i++) {
        const proposal = proposalFile.proposals[i];
        await propose(proposalFile.config, proposal);
    }
}

async function propose(config, proposal) {
    const proposalCall = getCall(proposal);
    const result = await defenderAdmin.createProposal({
        contract: {
            address: config.contracts[proposal.contract],
            network: config.network,
        },
        title: proposal.title,
        description: proposal.description,
        type: 'custom',
        functionInterface: proposalCall.function,
        functionInputs: proposalCall.inputs,
        via: config.signer.address,
        viaType: config.signer.type,
    });
    console.log(result.url);
}

function getCall(proposal) {
    switch (proposal.type) {
        case 'deploy':
            return call.createUpgradeableLockAtVersion(proposal.initArgs, proposal.version);

        case 'updateKeyPricing':
            return call.updateKeyPricing(proposal.keyPrice, proposal.tokenAddress);

        case 'withdraw':
            return call.withdraw(proposal.tokenAddress, proposal.recipient, proposal.amount);

        default:
            throw `unknown proposal type ${proposal.type}`;
    }
}
