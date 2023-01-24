const DEBUG = require('debug')('forta:ens');
const { task } = require('hardhat/config');
const { execSync } = require('child_process');
const { getDefaultDeployer } = require('../scripts/utils/contractHelpers');
const { getDeploymentOutputWriter } = require('../scripts/utils/deploymentFiles');
const deployEnv = require('../../scripts/loadEnv');

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
    if (currentOwner == ethers.constants.AddressZero) {
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

        if (signerAddress != owner) {
            await registry
                .connect(signer)
                .setOwner(ethers.utils.namehash(name), owner)
                .then((tx) => tx.wait())
                .catch((e) => DEBUG(e));
        }
    }
};

const reverseRegister = async (contract, name) => {
    const reverseResolved = await contract.provider.lookupAddress(contract.address);
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

async function main(args, hre) {
    const { ethers } = hre;

    const commit = execSync(`/usr/bin/git log -1 --format='%H'`).toString().trim();
    const chainId = await ethers.provider.getNetwork().then((n) => n.chainId);
    const provider = hre.ethers.provider;
    const network = await hre.ethers.provider.getNetwork();
    const deployer = await getDefaultDeployer(hre, ethers.provider, null, network);
    const CACHE = getDeploymentOutputWriter(chainId);
    console.log(`Deploying contracts from commit ${commit} on chain ${chainId}`);

    const { contracts } = await deployEnv.loadEnv();
    contracts.ens = {};

    contracts.ens.registry = await loadENSContract(ethers, CACHE, 'ENSRegistry', 'ens-registry', deployer);

    DEBUG(`registry: ${contracts.ens.registry.address}`);

    contracts.ens.resolver = await loadENSContract(ethers, CACHE, 'PublicResolver', 'ens-resolver', deployer);

    DEBUG(`resolver: ${contracts.ens.resolver.address}`);
    contracts.ens.reverse = await loadENSContract(ethers, CACHE, 'ReverseRegistrar', 'ens-reverse', deployer);

    DEBUG(`reverse: ${contracts.ens.reverse.address}`);
    provider.network.ensAddress = contracts.ens.registry.address;

    await registerNode('registries.forta.eth', deployer.address, { ...contracts.ens, chainId: chainId });
    await Promise.all([
        registerNode('dispatch.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.dispatch.address, chainId: chainId }),
        registerNode('staking.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.staking.address, chainId: chainId }),
        registerNode('slashing.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.staking.address, chainId: chainId }),
        registerNode('agents.registries.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.agents.address, chainId: chainId }),
        registerNode('scanners.registries.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.scanners.address, chainId: chainId }),
    ]);

    DEBUG('ens configuration');

    DEBUG('Starting reverse registration...');
    var reverseRegisters = [reverseRegister(contracts.token, 'forta.eth')];
    reverseRegisters = reverseRegisters.concat([
        reverseRegister(contracts.dispatch, 'dispatch.forta.eth'),
        reverseRegister(contracts.staking, 'staking.forta.eth'),
        reverseRegister(contracts.slashing, 'slashing.forta.eth'),
        reverseRegister(contracts.agents, 'agents.registries.forta.eth'),
        reverseRegister(contracts.scanners, 'scanners.registries.forta.eth'),
        // contract.escrow doesn't support reverse registration (not a component)
    ]);

    await Promise.all(reverseRegisters);
}

task('ens-register')
    .addPositionalParam('release', ')')
    .setDescription(
        `Registers contracts to ENS
        `
    )
    .setAction(main);
