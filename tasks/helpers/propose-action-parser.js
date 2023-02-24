const { formatParams, parseAddress } = require('../../scripts/utils/deploymentFiles');
const { kebabize } = require('../../scripts/utils/stringUtils');
const DEBUG = require('debug')('forta:propose');

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

async function mapContractInfo(hre, deploymentInfo, network, contractName) {
    return {
        name: contractName,
        network,
        address: parseAddress(deploymentInfo, kebabize(contractName)),
        abi: JSON.stringify([...(await hre.artifacts.readArtifact(contractName).then((a) => a.abi))]),
    };
}

function encodeMulticall(abi, hre, stepInfo) {
    DEBUG('multicall');
    if (!abi.find((method) => method.name === 'multicall')) {
        throw new Error('Contract does not support multicall');
    }
    const functionInterface = MULTICALL_ABI;
    DEBUG(functionInterface.inputs);
    const interface = new hre.ethers.utils.Interface(abi);
    const functionInputs = [stepInfo.params.map((input) => interface.encodeFunctionData(stepInfo.methodName, input))];
    DEBUG(functionInputs);
    return { functionInterface, functionInputs };
}

function mapStep(hre, deploymentInfo, network, contractInfo, stepInfo) {
    if (!Array.isArray(stepInfo.params[0])) {
        throw new Error('Params must be array of arrays (each row is a list of method params, use multiple rows for multicall');
    }
    stepInfo.params = stepInfo.params.map((callArgs) => formatParams(deploymentInfo, callArgs));
    const abi = JSON.parse(contractInfo.abi);
    return stepInfo.params.map((callParams) => {
        let functionInputs = callParams;
        let functionInterface = abi.find((method) => method.name === stepInfo.methodName);
        if (!functionInterface) {
            throw Error(`method ${stepInfo.methodName} not found in ABI`);
        }
        // Defender admin input parsing breaks for tuple type params, we force multicall to encode the method and bypass faulty type checking
        if (functionInterface.inputs[0].type === 'tuple') {
            ({ functionInterface, functionInputs } = encodeMulticall(abi, hre, stepInfo));
        }
        return {
            contractId: `${network}-${contractInfo.address}`,
            targetFunction: functionInterface,
            functionInputs: functionInputs,
            type: 'custom',
        };
    });
}

async function parseAdminProposals(hre, config, deploymentInfo, network) {
    const contracts = [];
    const steps = [];
    for (const contractName of Object.keys(config)) {
        const contractInfo = await mapContractInfo(hre, deploymentInfo, network, contractName);
        contracts.push(contractInfo);
        steps.push(
            ...config[contractName]
                .map((stepInfo) => {
                    return mapStep(hre, deploymentInfo, network, contractInfo, stepInfo);
                })
                .flat()
        );
    }
    return { contracts, steps };
}

module.exports = parseAdminProposals;
