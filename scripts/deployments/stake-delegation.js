/* eslint-disable no-unexpected-multiline */
const { ethers, upgrades } = require('hardhat');
const DEBUG = require('debug')('forta:migration');
const utils = require('../utils');

const deployEnv = require('../loadEnv');

upgrades.silenceWarnings();

const registerNode = async (name, owner, opts = {}) => {
    const resolved = opts.resolved;
    const registry = opts.registry; //?? contracts.ens.registry;
    const resolver = opts.resolver; //?? contracts.ens.resolver;
    const signer = opts.signer ?? registry.signer ?? resolver.signer;
    const signerAddress = await signer.getAddress();
    utils.assertNotUsingHardhatKeys(opts.chainId, signerAddress);

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

/*********************************************************************************************************************
 *                                                Migration workflow                                                 *
 *********************************************************************************************************************/
async function migrate(config = {}) {
    const { provider, deployer, deployment, network, CACHE } = await deployEnv.loadEnv(config);
    const { name, chainId } = network;

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`ENS:      ${provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`Balance:  ${await provider.getBalance(deployer.address).then(ethers.utils.formatEther)}${ethers.constants.EtherSymbol}`);
    DEBUG('----------------------------------------------------');
    utils.assertNotUsingHardhatKeys(chainId, deployer);

    if (config?.force) {
        CACHE.clear();
    }
    config.childChain = config.childChain ? config.childChain : !!deployEnv.CHILD_CHAIN_MANAGER_PROXY[chainId];
    config.childChainManagerProxy = config.childChainManagerProxy ?? deployEnv.CHILD_CHAIN_MANAGER_PROXY[chainId];
    config.chainsToDeploy = config.chainsToDeploy ?? ['L1', 'L2'];
    const contracts = {};
    const slashParams = {};

    const hardhatDeployment = chainId === 31337;

    const fortaConstructorArgs = [];
    DEBUG('config.childChain', config.childChain);
    DEBUG('config.childChainManagerProxy', config.childChainManagerProxy);

    // For test compatibility: since we need to mint and FortaBridgedPolygon does not mint(), we base our decision to deploy
    // FortaBridgedPolygon is based on the existence of childChainManagerProxy, not childChain
    config.childChainManagerProxy ? fortaConstructorArgs.push(config.childChainManagerProxy) : null;

    contracts.rewardsDistributor = await utils.tryFetchProxy(
        CACHE,
        'staking-rewards',
        'RewardsDistributor',
        'uups',
        [deployment.access.address, ...deployEnv.FEE_PARAMS(chainId)],
        {
            constructorArgs: [deployment.forwarder.address, deployment.token.address, deployment['stake-subject-gateway'].address],
            unsafeAllow: ['delegatecall'],
        }
    );

    DEBUG(`[${Object.keys(contracts).length}.1] rewardsDistributor ${contracts.rewardsDistributor.address}`);

    contracts.stakeAllocator = await utils.tryFetchProxy(CACHE, 'staking-allocator', 'StakeAllocator', 'uups', [deployment.access.address], {
        constructorArgs: [deployment.forwarder.address, deployment['stake-subject-gateway'].address, contracts.rewardsDistributor.address],
        unsafeAllow: ['delegatecall'],
    });

    DEBUG(`[${Object.keys(contracts).length}.1] stake allocator: ${contracts.stakeAllocator.address}`);

    DEBUG(`Deploying ScannerPool registry...`);

    contracts.scannerPools = await utils.tryFetchProxy(
        CACHE,
        'scanner-pools',
        'ScannerPoolRegistry',
        'uups',
        [deployment.access.address, 'Forta Scanner Pools', 'FScannerPools', deployment['stake-subject-gateway'].address, deployEnv.SCANNER_REGISTRATION_DELAY(chainId)],
        {
            constructorArgs: [deployment.forwarder.address, contracts.stakeAllocator.address],
            unsafeAllow: 'delegatecall',
        }
    );

    DEBUG(`[${Object.keys(contracts).length}] scannerPools: ${contracts.scannerPools.address}`);

    contracts.registryMigration = await utils.tryFetchProxy(CACHE, 'scanner-to-scanner-pool-migration', 'ScannerToScannerPoolMigration', 'uups', [deployment.access.address], {
        constructorArgs: [deployment.forwarder.address, deployment.scanners.address, contracts.scannerPools.address, deployment.staking.address],
        unsafeAllow: 'delegatecall',
    });

    DEBUG(`roles fetched`);

    if (!hardhatDeployment) {
        if (!provider.network.ensAddress) {
            contracts.ens = {};

            contracts.ens.registry = await ethers.getContractFactory('ENSRegistry', deployer).then((factory) => utils.tryFetchContract(CACHE, 'ens-registry', factory, []));

            DEBUG(`registry: ${contracts.ens.registry.address}`);

            contracts.ens.resolver = await ethers
                .getContractFactory('PublicResolver', deployer)
                .then((factory) => utils.tryFetchContract(CACHE, 'ens-resolver', factory, [contracts.ens.registry.address, ethers.constants.AddressZero]));

            DEBUG(`resolver: ${contracts.ens.resolver.address}`);

            contracts.ens.reverse = await ethers
                .getContractFactory('ReverseRegistrar', deployer)
                .then((factory) => utils.tryFetchContract(CACHE, 'ens-reverse', factory, [contracts.ens.registry.address, contracts.ens.resolver.address]));

            DEBUG(`reverse: ${contracts.ens.reverse.address}`);

            // link provider to registry
            provider.network.ensAddress = contracts.ens.registry.address;

            // ens registration

            if (config.childChain) {
                await Promise.all([
                    registerNode('staking-subjects.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.subjectGateway.address, chainId: chainId }),
                    registerNode('scanner-pools.registries.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.scannerPools.address, chainId: chainId }),
                    registerNode('rewards.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.rewardsDistributor.address, chainId: chainId }),
                ]);
            }

            DEBUG('ens configuration');
        } else {
            contracts.ens = {};
            const ensRegistryAddress = await CACHE.get('ens-registry');
            contracts.ens.registry = ensRegistryAddress ? await utils.attach('ENSRegistry', ensRegistryAddress) : null;
            const ensResolverAddress = await CACHE.get('ens-resolver');
            contracts.ens.resolver = ensRegistryAddress ? await utils.attach('PublicResolver', ensResolverAddress) : null;
        }
        DEBUG('Starting reverse registration...');
        var reverseRegisters = [];
        if (config.childChain) {
            reverseRegisters = reverseRegisters.concat([
                reverseRegister(contracts.subjectGateway, 'staking-subjects.forta.eth'),
                reverseRegister(contracts.scannerPools, 'scanner-pools.registries.forta.eth'),
                reverseRegister(contracts.rewardsDistributor, 'rewards.forta.eth'),
            ]);
        }
        await Promise.all(reverseRegisters);

        DEBUG('reverse registration');
    }

    return {
        provider,
        deployer,
        contracts,
        slashParams,
    };
}

if (require.main === module) {
    migrate()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = migrate;
