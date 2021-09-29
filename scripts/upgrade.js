const { ethers, upgrades } = require('hardhat');
const { NonceManager } = require('@ethersproject/experimental');



async function main() {
    // wrap provider to re-enable maxpriorityfee mechanism
    const provider = new ethers.providers.FallbackProvider([ ethers.provider ], 1);
    provider.getFeeData = () => Promise.resolve({
        maxFeePerGas:         ethers.utils.parseUnits('100', 'gwei'),
        maxPriorityFeePerGas: ethers.utils.parseUnits('5',   'gwei'),
    });

    // create new wallet on top of the wrapped provider
    // const deployer = await ethers.getSigner().then(signer => new NonceManager(signer));
    const deployer = new NonceManager(
        ethers.Wallet.fromMnemonic(process.env.MNEMONIC || 'test test test test test test test test test test test junk')
    ).connect(provider);
    await deployer.getTransactionCount().then(nonce => deployer.setTransactionCount(nonce));

    deployer.address = await deployer.getAddress();
    const { name, chainId } = await deployer.provider.getNetwork();

    ethers.provider.network.ensAddress = ethers.provider.network.ensAddress || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';

    console.log(`Network:  ${name} (${chainId})`);
    console.log(`Deployer: ${deployer.address}`);
    console.log('----------------------------------------------------');



    function getFactory(name) {
        return ethers.getContractFactory(name, deployer);
    }

    function attach(name, ...params) {
        return getFactory(name)
        .then(contract => contract.attach(...params));
    }

    function deploy(name, ...params) {
        return getFactory(name)
        .then(contract => contract.deploy(...params))
        .then(f => f.deployed());
    }

    function deployUpgradeable(name, kind, ...params) {
        return getFactory(name)
        .then(contract => upgrades.deployProxy(contract, params, { kind, unsafeAllow: 'delegatecall' }))
        .then(f => f.deployed());
    }

    function performUpgrade(proxy, name) {
        return getFactory(name)
        .then(contract => upgrades.upgradeProxy(proxy.address, contract, { unsafeAllow: 'delegatecall' }));
    }

    // await performUpgrade({ address: '0xa3a0ea252d3cf18b30c3ada0e013671beedb4262' }, 'AgentRegistry');
    // await performUpgrade({ address: '0x65F22a702F88B53883A89F772449c7667DB9ab9C' }, 'ScannerRegistry');
    // await performUpgrade({ address: '0x77Db997b9Ad5e14386aB367fa47de073b3743248' }, 'Dispatch');
    // await upgrades.erc1967.getImplementationAddress('0xa3a0ea252d3cf18b30c3ada0e013671beedb4262').then(console.log);
    // await upgrades.erc1967.getImplementationAddress('0x65F22a702F88B53883A89F772449c7667DB9ab9C').then(console.log);
    await upgrades.erc1967.getImplementationAddress('0x77Db997b9Ad5e14386aB367fa47de073b3743248').then(console.log);

    console.log('done');
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
