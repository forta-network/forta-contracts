const { parseAddress } = require('../../scripts/utils/deploymentFiles');

const PROXY_ABI = [
    { inputs: [{ internalType: 'address', name: 'newImplementation', type: 'address' }], name: 'upgradeTo', outputs: [], stateMutability: 'nonpayable', type: 'function' },
];

async function parseUpgradeProposals(hre, prepared, deploymentInfo, network) {
    const contracts = await Promise.all(
        Object.entries(prepared).map(async ([key, { impl }]) => {
            const contractName = prepared[key].impl.name;
            if (!contractName) {
                throw new Error(`No contract name for prepared implementation: ${key} in network ${network}`);
            }
            return {
                name: contractName,
                network,
                address: parseAddress(deploymentInfo, key),
                abi: JSON.stringify([...(await hre.artifacts.readArtifact(contractName).then((a) => a.abi)), ...PROXY_ABI]),
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
