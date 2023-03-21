const signERC712ScannerRegistration = async (verifyingContractInfo, registration, signer) => {
    const domain = {
        name: 'ScannerPoolRegistry',
        version: '1',
        chainId: verifyingContractInfo.chainId,
        verifyingContract: verifyingContractInfo.address,
    };
    const types = {
        ScannerNodeRegistration: [
            { name: 'scanner', type: 'address' },
            { name: 'scannerPoolId', type: 'uint256' },
            { name: 'chainId', type: 'uint256' },
            { name: 'metadata', type: 'string' },
            { name: 'timestamp', type: 'uint256' },
        ],
    };
    return signer._signTypedData(domain, types, registration);
};

const createERC712ScannerRegistrationToken = async (verifyingContractInfo, registration, signer) => {
    const signature = await signERC712ScannerRegistration(verifyingContractInfo, registration, signer);
    return Buffer.from(
        JSON.stringify({
            registrationInput: registration,
            signature: signature.toString('hex'),
        })
    ).toString('base64');
};

module.exports = { signERC712ScannerRegistration, createERC712ScannerRegistrationToken };
