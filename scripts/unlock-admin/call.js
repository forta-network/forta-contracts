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

function simplify(func) {
    return {
        name: func.name,
        inputs: func.inputs.map((input) => {
            return { name: input.name, type: input.type };
        }),
    };
}

module.exports = {
    createUpgradeableLockAtVersion,
    updateKeyPricing,
    withdraw,
    ABI,
};
