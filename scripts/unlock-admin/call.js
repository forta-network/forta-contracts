const { ethers } = require('ethers');

const abi = {
    unlock: require('./abis/Unlock.json'),
    publicLock: require('./abis/PublicLock.json'),
};

const contracts = {
    unlock: new ethers.utils.Interface(abi.unlock),
    publicLock: new ethers.utils.Interface(abi.publicLock),
};

function createUpgradeableLockAtVersion(initArgs, version) {
    const args = [initArgs.lockCreator, initArgs.expirationDuration, initArgs.tokenAddress, initArgs.keyPrice, initArgs.maxNumberOfKeys, initArgs.lockName];
    const data = contracts.publicLock.encodeFunctionData('initialize', args);
    return {
        function: contracts.unlock.getFunction('createUpgradeableLockAtVersion'),
        inputs: [data, version],
    };
}

function updateKeyPricing(keyPrice, tokenAddress) {
    return {
        function: contracts.unlock.getFunction('updateKeyPricing'),
        inputs: [keyPrice, tokenAddress],
    };
}

function withdraw(tokenAddress, recipient, amount) {
    return {
        function: contracts.unlock.getFunction('withdraw'),
        inputs: [tokenAddress, recipient, amount],
    };
}

module.exports = {
    createUpgradeableLockAtVersion,
    updateKeyPricing,
    withdraw,
};
