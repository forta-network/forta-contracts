const DEBUG = require('debug')('forta:propose');
const { camelize, kebabize, upperCaseFirst } = require('../scripts/utils/stringUtils');
const {
    getDeployment,
    getDeployedImplementations,
    formatParams,
    getMultisigAddress,
    getProxyOrContractAddress,
    getProposedAdminActions,
} = require('../scripts/utils/deploymentFiles');
const { task } = require('hardhat/config');
const { fromChainId } = require('defender-base-client');
const { AdminClient } = require('defender-admin-client');
const { writeFileSync } = require('fs');
const { toEIP3770 } = require('../scripts/utils');
const client = new AdminClient({ apiKey: process.env.DEFENDER_API_KEY, apiSecret: process.env.DEFENDER_API_SECRET });

const summaryPath = process.env.GITHUB_STEP_SUMMARY;

const PROXY_ABI = [
    { inputs: [{ internalType: 'address', name: 'newImplementation', type: 'address' }], name: 'upgradeTo', outputs: [], stateMutability: 'nonpayable', type: 'function' },
];

const MULTICALL_ABI = {
    inputs: [
        {
            internalType: 'bytes[]',
            name: 'data',
            type: 'bytes[]',
        },
    ],
    name: 'multicall',
    outputs: [
        {
            internalType: 'bytes[]',
            name: 'results',
            type: 'bytes[]',
        },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
};

async function parseUpgradeProposals(hre, prepared, deployment, network) {
    const contracts = await Promise.all(
        Object.entries(prepared).map(async ([key, { impl }]) => {
            return {
                name: upperCaseFirst(camelize(key)),
                network,
                address: getProxyOrContractAddress(deployment, key),
                abi: JSON.stringify([...(await hre.artifacts.readArtifact(upperCaseFirst(camelize(key))).then((a) => a.abi)), ...PROXY_ABI]),
                newImplementation: impl.address,
            };
        })
    );

    console.error(`Contracts:\n${contracts.map((c) => `- ${c.name} at ${c.address} to ${c.newImplementation}`).join('\n')}`);

    const steps = contracts.map(({ address, network, newImplementation }) => ({
        contractId: `${network}-${address}`,
        targetFunction: PROXY_ABI[0],
        functionInputs: [newImplementation],
        type: 'custom',
    }));
    return { contracts, steps };
}

async function parseAdminProposals(hre, config, deployment, network) {
    async function mapContractInfo(deployment, contractName) {
        return {
            name: contractName,
            network,
            address: getProxyOrContractAddress(deployment, kebabize(contractName)),
            abi: JSON.stringify([...(await hre.artifacts.readArtifact(contractName).then((a) => a.abi))]),
        };
    }

    function mapStep(contractInfo, stepInfo) {
        if (!Array.isArray(stepInfo.params[0])) {
            throw new Error('Params must be array of arrays (each row is a list of method params, use multiple rows for multicall');
        }
        stepInfo.params = stepInfo.params.map((callArgs) => formatParams(deployment, callArgs));

        let functionInterface, functionInputs;
        const abi = JSON.parse(contractInfo.abi);
        return stepInfo.params.map((callParams) => {
            functionInterface = abi.find((method) => method.name === stepInfo.methodName);
            if (!functionInterface) {
                throw Error(`method ${stepInfo.methodName} not found in ABI`);
            }
            DEBUG(functionInterface.inputs[0]);

            functionInputs = callParams[0];

            // Defender admin input parsing breaks for tuple type params, we force multicall to encode the method and bypass faulty type checking
            if (functionInterface.inputs[0].type === 'tuple') {
                DEBUG('multicall');
                if (!abi.find((method) => method.name === 'multicall')) {
                    throw new Error('Contract does not support multicall');
                }
                functionInterface = MULTICALL_ABI;
                DEBUG(functionInterface.inputs);
                const interface = new hre.ethers.utils.Interface(abi);
                functionInputs = [stepInfo.params.map((input) => interface.encodeFunctionData(stepInfo.methodName, input))];
                DEBUG(functionInputs);
            }
            return {
                contractId: `${network}-${contractInfo.address}`,
                targetFunction: functionInterface,
                functionInputs: functionInputs,
                type: 'custom',
            };
        });
    }
    const contracts = [];
    const steps = [];
    for (const contractName of Object.keys(config)) {
        const contractInfo = await mapContractInfo(deployment, contractName);
        contracts.push(contractInfo);
        steps.push(...config[contractName].map((method) => mapStep(contractInfo, method)).flat());
    }
    return { contracts, steps: steps};
}

async function main(args, hre) {
    const { ethers } = hre;
    const chainId = await ethers.provider.getNetwork().then((n) => n.chainId);
    const network = fromChainId(chainId);
    const multisig = getMultisigAddress(chainId);
    const prepared = getDeployedImplementations(chainId, args.release);
    const adminProposed = getProposedAdminActions(chainId, args.release);
    const deployment = getDeployment(chainId);
    const contracts = [];
    const steps = [];

    console.log('Parsing new implementations...');
    /*const upgradeProposal = await parseUpgradeProposals(hre, prepared, deployment, network);
    if (upgradeProposal.steps.length > 0) {
        console.log(`Proposing upgrades for ${upgradeProposal.steps.length} contracts`);
        contracts.push(...upgradeProposal.contracts);
        steps.push(...upgradeProposal.steps);
    } else {
        console.log('No upgrades were prepared in previous steps.');
    }*/

    const adminProposala = await parseAdminProposals(hre, adminProposed, deployment, network);
    if (adminProposala.steps.length > 0) {
        console.log(`Proposing ${adminProposala.steps.length} admin actons`);
        contracts.push(...adminProposala.contracts);
        steps.push(...adminProposala.steps);
        steps.forEach((step) => console.dir(step));
    } else {
        console.log('No admin actions.');
    }

    const proposal = await client.createProposal({
        contract: contracts,
        title: args.title,
        description: args.description,
        type: 'batch',
        via: multisig,
        viaType: 'Gnosis Safe',
        metadata: {},
        steps,
    });
    console.log(proposal.url);
    const multisigLink = `https://app.safe.global/${toEIP3770(chainId, multisig)}/home`;
    const outputText = `## Approval\n\n[Approval required](${proposal.url}) by multisig [\`${multisig}\`](${multisigLink}) signers.`;

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
