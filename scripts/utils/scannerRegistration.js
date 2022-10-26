const signERC712ScannerRegistration = (verifyingContractInfo, registration, signer) => {
    const domain = {
        name: 'NodeRunnerRegistry',
        version: '1',
        chainId: verifyingContractInfo.chainId,
        verifyingContract: verifyingContractInfo.address,
    };
    const types = {
        ScannerNodeRegistration: [
            { name: 'scanner', type: 'address' },
            { name: 'nodeRunnerId', type: 'uint256' },
            { name: 'chainId', type: 'uint256' },
            { name: 'metadata', type: 'string' },
            { name: 'timestamp', type: 'uint256' },
        ],
    };
    return signer._signTypedData(domain, types, registration);
};

module.exports = { signERC712ScannerRegistration };
