const { getDeploymentInfo, getDeployedImplementations, getProposedAdminActions } = require('../scripts/utils/deploymentFiles');
const parseAdminProposals = require('./helpers/propose-action-parser');
const parseUpgradeProposals = require('./helpers/propose-upgrades-parser');
const { task } = require('hardhat/config');
const { fromChainId } = require('defender-base-client');
const { AdminClient } = require('defender-admin-client');
const { writeFileSync } = require('fs');
const { toEIP3770 } = require('../scripts/utils');

const summaryPath = process.env.GITHUB_STEP_SUMMARY;

async function main(args, hre) {
    const client = new AdminClient({ apiKey: process.env.DEFENDER_API_KEY, apiSecret: process.env.DEFENDER_API_SECRET });
    const { ethers } = hre;
    const chainId = await ethers.provider.getNetwork().then((n) => n.chainId);
    const network = fromChainId(chainId);
    const prepared = getDeployedImplementations(chainId, args.release);
    const adminProposed = getProposedAdminActions(chainId, args.release);
    const deploymentInfo = getDeploymentInfo(chainId);
    const contracts = [];
    const steps = [];

    console.log('Parsing new implementations...');
    const upgradeProposal = await parseUpgradeProposals(hre, prepared, deploymentInfo, network);
    if (upgradeProposal.steps.length > 0) {
        console.log(`Proposing upgrades for ${upgradeProposal.steps.length} contracts`);
        contracts.push(...upgradeProposal.contracts);
        steps.push(...upgradeProposal.steps);
    } else {
        console.log('No upgrades were prepared in previous steps.');
    }

    const adminProposala = await parseAdminProposals(hre, adminProposed, deploymentInfo, network);
    if (adminProposala.steps.length > 0) {
        console.log(`Proposing ${adminProposala.steps.length} admin actons`);
        contracts.push(...adminProposala.contracts);
        steps.push(...adminProposala.steps);
    } else {
        console.log('No admin actions.');
    }

    const proposal = await client.createProposal({
        contract: contracts,
        title: args.title,
        description: args.description,
        type: 'batch',
        via: deploymentInfo.multisig,
        viaType: 'Gnosis Safe',
        metadata: {},
        steps,
    });

    const multisigLink = `https://app.safe.global/${toEIP3770(chainId, deploymentInfo.multisig)}/home`;
    const outputText = `## Approval\n\n[Approval required](${proposal.url}) by multisig [\`${deploymentInfo.multisig}\`](${multisigLink}) signers.`;

    if (summaryPath) {
        writeFileSync(summaryPath, outputText);
    }
    console.log(outputText);
}

task('propose-admin')
    .addPositionalParam('release', 'Release folder')
    .addPositionalParam('title', 'Proposal title')
    .addPositionalParam('description', 'Proposal description')
    .setDescription('Batches prepared upgrades and admin actions to launch in a multisig through Defender Admin')
    .setAction(main);
