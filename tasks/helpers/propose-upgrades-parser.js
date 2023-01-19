const { camelize, upperCaseFirst } = require('../../scripts/utils/stringUtils');
const { getProxyOrContractAddress } = require('../../scripts/utils/deploymentFiles');

const PROXY_ABI = [
    { inputs: [{ internalType: 'address', name: 'newImplementation', type: 'address' }], name: 'upgradeTo', outputs: [], stateMutability: 'nonpayable', type: 'function' },
];

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

module.exports = parseUpgradeProposals;
