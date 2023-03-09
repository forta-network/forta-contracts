const DEBUG = require('debug')('forta:ens');
const hre = require('hardhat');
const { getDefaultDeployer, getDefaultProvider } = require('./utils/contractHelpers');
const { getDeploymentOutputWriter } = require('./utils/deploymentFiles');
const deployEnv = require('./loadEnv');
const { networkName } = require('./utils');

const registerNode = async (hre, name, owner, opts = {}) => {
    const { ethers } = hre;
    const resolved = opts.resolved;
    const registry = opts.registry; //?? contracts.ens.registry;
    const resolver = opts.resolver; //?? contracts.ens.resolver;
    const signer = opts.signer ?? registry.signer ?? resolver.signer;
    const signerAddress = await signer.getAddress();

    const [label, ...self] = name.split('.');
    const parent = self.join('.');
    DEBUG('registerNode', name);
    const parentOwner = await registry.owner(ethers.utils.namehash(parent));
    if (parentOwner != signerAddress) {
        DEBUG('Unauthorized signer, owner is: ', parentOwner);
        DEBUG('parent is: ', parent);
        DEBUG('namehash is: ', ethers.utils.namehash(parent));

        throw new Error('Unauthorized signer');
    }
    const currentOwner = await registry.owner(ethers.utils.namehash(name));
    DEBUG('currentOwner', currentOwner);
    if (currentOwner == ethers.constants.AddressZero) {
        DEBUG('Setting subrecord');
        await registry
            .connect(signer)
            .setSubnodeRecord(ethers.utils.namehash(parent), ethers.utils.id(label), resolved ? signerAddress : owner, resolver.address, 0)
            .then((tx) => tx.wait())
            .catch((e) => DEBUG(e));
    }
    if (resolved) {
        const currentResolved = await signer.provider.resolveName(name);
        DEBUG(resolved, currentResolved);

        if (resolved != currentResolved) {
            await resolver
                .connect(signer)
                ['setAddr(bytes32,address)'](ethers.utils.namehash(name), resolved)
                .then((tx) => tx.wait())
                .catch((e) => DEBUG(e));
        }
    }
};

async function changeOwner(hre, name, signer, owner, registry) {
    const [label, ...self] = name.split('.');
    const parent = self.join('.');
    console.log('owner', await registry.owner(hre.ethers.utils.namehash(name)));
    await registry
        .connect(signer)
        .setSubnodeOwner(hre.ethers.utils.namehash(parent), hre.ethers.utils.id(label), owner)
        .then((tx) => tx.wait())
        .catch((e) => DEBUG(e));
}

const reverseRegister = async (contract, name) => {
    const reverseResolved = await contract.provider.lookupAddress(contract.address);
    console.log(contract.address)
    console.log(reverseResolved);
    if (reverseResolved != name) {
        await contract
            .setName(contract.provider.network.ensAddress, name)
            .then((tx) => tx.wait())
            .catch((e) => DEBUG(e));
    }
};

async function loadENSContract(ethers, cache, contractName, key, deployer) {
    const factory = await ethers.getContractFactory(contractName, deployer);
    const address = await cache.get(`${key}.address`);
    return factory.attach(address);
}

async function main() {
    const provider = await getDefaultProvider(hre);
    const chainId = await provider.getNetwork().then((n) => n.chainId);

    const deployer = await getDefaultDeployer(hre, provider, networkName(chainId));
    const CACHE = getDeploymentOutputWriter(chainId);

    const { contracts } = await deployEnv.loadEnv({ deployer });
    console.log(Object.keys(contracts));

    contracts.ens = {};

    contracts.ens.registry = await loadENSContract(hre.ethers, CACHE, 'ENSRegistry', 'ens-registry', deployer);

    DEBUG(`registry: ${contracts.ens.registry.address}`);

    contracts.ens.resolver = await loadENSContract(hre.ethers, CACHE, 'PublicResolver', 'ens-resolver', deployer);

    DEBUG(`resolver: ${contracts.ens.resolver.address}`);
    contracts.ens.reverse = await loadENSContract(hre.ethers, CACHE, 'ReverseRegistrar', 'ens-reverse', deployer);

    DEBUG(`reverse: ${contracts.ens.reverse.address}`);
    provider.network.ensAddress = contracts.ens.registry.address;
    // await changeOwner(hre, 'dispatch.forta.eth', deployer, owner, contracts.ens.registry);
    // await changeOwner(hre, 'staking.forta.eth', deployer, owner, contracts.ens.registry);
    // await changeOwner(hre, 'agents.registries.forta.eth', deployer, owner, contracts.ens.registry);
    // await changeOwner(hre, 'scanners.registries.forta.eth', deployer, owner, contracts.ens.registry);

    // await registerNode(hre, 'dispatch.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.dispatch.address, chainId: chainId });
    // await registerNode(hre, 'staking.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.fortaStaking.address, chainId: chainId });
    // await registerNode(hre, 'slashing.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.slashingController.address, chainId: chainId });
    // await registerNode(hre, 'agents.registries.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.agentRegistry.address, chainId: chainId });
    // await registerNode(hre, 'scanners.registries.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.scannerRegistry.address, chainId: chainId });
    // await registerNode(hre, 'pools.registries.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.scannerPoolRegistry.address, chainId: chainId });
    // await registerNode(hre, 'rewards.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.rewardsDistributor.address, chainId: chainId });
    // await registerNode(hre, 'allocator.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.stakeAllocator.address, chainId: chainId });
    // await registerNode(hre, 'migration.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.scannerToScannerPoolMigration.address, chainId: chainId });

    DEBUG('ens configuration');

    DEBUG('Starting reverse registration...');
    // await reverseRegister(contracts.dispatch, 'dispatch.forta.eth');
    // await reverseRegister(contracts.fortaStaking, 'staking.forta.eth');
    // await reverseRegister(contracts.slashingController, 'slashing.forta.eth');
    // await reverseRegister(contracts.agentRegistry, 'agents.registries.forta.eth');
    // await reverseRegister(contracts.scannerRegistry, 'scanners.registries.forta.eth');
    // await reverseRegister(contracts.scannerPoolRegistry, 'pools.registries.forta.eth');
    // await reverseRegister(contracts.rewardsDistributor, 'rewards.forta.eth');
    // await reverseRegister(contracts.stakeAllocator, 'allocator.forta.eth');
    // await reverseRegister(contracts.scannerToScannerPoolMigration, 'migration.forta.eth');

}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;
