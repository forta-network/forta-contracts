const { ethers } = require('ethers');

const ABI = {
    unlock: require('./abis/Unlock.json'),
    publicLock: require('./abis/PublicLock.json'),
};

const contracts = {
    unlock: new ethers.utils.Interface(ABI.unlock),
    publicLock: new ethers.utils.Interface(ABI.publicLock),
};

function createUpgradeableLockAtVersion(initArgs, version) {
    const args = [initArgs.lockCreator, initArgs.expirationDuration, initArgs.tokenAddress, initArgs.keyPrice, initArgs.maxNumberOfKeys, initArgs.lockName];
    const data = contracts.publicLock.encodeFunctionData('initialize', args);
    return {
        func: simplify(contracts.unlock.getFunction('createUpgradeableLockAtVersion')),
        inputs: [data, version],
    };
}

function updateKeyPricing(keyPrice, tokenAddress) {
    return {
        func: simplify(contracts.publicLock.getFunction('updateKeyPricing')),
        inputs: [keyPrice, tokenAddress],
    };
}

function withdraw(tokenAddress, recipient, amount) {
    return {
        func: simplify(contracts.publicLock.getFunction('withdraw')),
        inputs: [tokenAddress, recipient, amount],
    };
}

function addLockManager(address) {
    return {
        func: simplify(contracts.publicLock.getFunction('addLockManager')),
        inputs: [address],
    };
}

function grantKeys(recipients, expirationTimestamps, keyManagers) {
    return {
        func: simplify(contracts.publicLock.getFunction('grantKeys')),
        inputs: [recipients, expirationTimestamps, keyManagers],
    };
}

function updateLockConfig(expirationDuration, maxNumberOfKeys, maxNumberOfKeysPerUser) {
    return {
        func: simplify(contracts.publicLock.getFunction('updateLockConfig')),
        inputs: [expirationDuration, maxNumberOfKeys, maxNumberOfKeysPerUser],
    };
}

function expireAndRefundFor(tokenId, refundAmount) {
    return {
        func: simplify(contracts.publicLock.getFunction('expireAndRefundFor')),
        inputs: [tokenId, refundAmount],
    };
}

function grantKeyExtension(tokenId, duration) {
    return {
        func: simplify(contracts.publicLock.getFunction('grantKeyExtension')),
        inputs: [tokenId, duration],
    };
}

function simplify(func) {
    return {
        name: func.name,
        inputs: func.inputs.map((input) => {
            return { name: input.name, type: input.type };
        }),
    };
}

function getABI(contractName) {
    if (contractName.startsWith('publicLock')) {
        contractName = 'publicLock';
    }
    return ABI[contractName];
}

module.exports = {
    createUpgradeableLockAtVersion,
    updateKeyPricing,
    withdraw,
    addLockManager,
    grantKeys,
    updateLockConfig,
    expireAndRefundFor,
    grantKeyExtension,
    getABI,
};
