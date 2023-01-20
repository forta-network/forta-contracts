/* eslint-disable no-unexpected-multiline */
const hre = require('hardhat');
const { ethers, upgrades } = hre;
const DEBUG = require('debug')('forta:migration');
const contractHelpers = require('../utils/contractHelpers');
const { getDeploymentOutputWriter } = require('../utils/deploymentFiles');
const SCANNER_SUBJECT = 0;
const AGENT_SUBJECT = 1;
const SCANNER_POOL_SUBJECT = 2;
const deployEnv = require('../loadEnv');

upgrades.silenceWarnings();

// TODO: take out to ENS task
/*
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
*/

/*********************************************************************************************************************
 *                                                Migration workflow                                                 *
 *********************************************************************************************************************/
async function migrate(config = {}) {
    const provider = config?.provider ?? config?.deployer?.provider ?? (await contractHelpers.getDefaultProvider(hre));
    const deployer = config?.deployer ?? (await contractHelpers.getDefaultDeployer(hre, provider));
    const { name, chainId } = await provider.getNetwork();
    const delay = deployEnv.DELAY[chainId] ?? 0;
    const saveToFile = config?.saveToFile || true;
    const deployEscrow = config?.deployEscrow;
    const deployScannerVersion = config?.deployScannerVersion;
    const force = config?.force || chainId === 31337;
    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`ENS:      ${provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`Balance:  ${await provider.getBalance(deployer.address).then(ethers.utils.formatEther)}${ethers.constants.EtherSymbol}`);
    DEBUG('----------------------------------------------------');

    let CACHE;
    if (saveToFile) {
        CACHE = getDeploymentOutputWriter(chainId);
        if (force) {
            CACHE?.clear();
        }
    }

    config.childChain = config.childChain ? config.childChain : !!deployEnv.CHILD_CHAIN_MANAGER_PROXY[chainId];
    config.childChainManagerProxy = config.childChainManagerProxy ?? deployEnv.CHILD_CHAIN_MANAGER_PROXY[chainId];
    const contracts = {};
    const slashParams = {};

    contracts.forwarder = await contractHelpers.tryFetchContract(hre, 'Forwarder', [], CACHE);

    DEBUG(`[${Object.keys(contracts).length}] forwarder: ${contracts.forwarder.address}`);

    const fortaConstructorArgs = [];
    DEBUG('config.childChain', config.childChain);
    DEBUG('config.childChainManagerProxy', config.childChainManagerProxy);

    // For test compatibility: since we need to mint and FortaBridgedPolygon does not mint(), we base our decision to deploy
    // FortaBridgedPolygon is based on the existence of childChainManagerProxy, not childChain
    config.childChainManagerProxy ? fortaConstructorArgs.push(config.childChainManagerProxy) : null;
    DEBUG(`Deploying token: ${config.childChainManagerProxy ? 'FortaBridgedPolygon' : 'Forta'}`);

    contracts.token = await contractHelpers.tryFetchProxy(
        hre,
        config.childChainManagerProxy ? 'FortaBridgedPolygon' : 'Forta',
        'uups',
        [deployer.address],
        {
            constructorArgs: fortaConstructorArgs,
        },
        CACHE
    );

    DEBUG(`[${Object.keys(contracts).length}] forta: ${contracts.token.address}`);

    if (config.childChain || chainId === 31337) {
        contracts.access = await contractHelpers.tryFetchProxy(
            hre,
            'AccessManager',
            'uups',
            [deployer.address],
            {
                constructorArgs: [contracts.forwarder.address],
                unsafeAllow: 'delegatecall',
            },
            CACHE
        );

        DEBUG(`[${Object.keys(contracts).length}] access: ${contracts.access.address}`);

        contracts.staking = await contractHelpers.tryFetchProxy(
            hre,
            'FortaStaking',
            'uups',
            [contracts.access.address, contracts.token.address, delay, deployEnv.TREASURY(chainId, deployer)],
            {
                constructorArgs: [contracts.forwarder.address],
                unsafeAllow: ['delegatecall'],
            },
            CACHE
        );
        await contracts.staking.setReentrancyGuard();
        DEBUG(`[${Object.keys(contracts).length}] staking: ${contracts.staking.address}`);

        contracts.subjectGateway = await contractHelpers.tryFetchProxy(
            hre,
            'StakeSubjectGateway',
            'uups',
            [contracts.access.address, contracts.staking.address],
            {
                constructorArgs: [contracts.forwarder.address],
                unsafeAllow: ['delegatecall'],
            },
            CACHE
        );

        DEBUG(`[${Object.keys(contracts).length}.1] stake subject gateway: ${contracts.subjectGateway.address}`);

        contracts.rewardsDistributor = await contractHelpers.tryFetchProxy(
            hre,
            'RewardsDistributor',
            'uups',
            [contracts.access.address, ...deployEnv.FEE_PARAMS(chainId)],
            {
                constructorArgs: [contracts.forwarder.address, contracts.token.address, contracts.subjectGateway.address],
                unsafeAllow: ['delegatecall'],
            },
            CACHE
        );

        DEBUG(`[${Object.keys(contracts).length}.1] rewardsDistributor ${contracts.rewardsDistributor.address}`);

        contracts.stakeAllocator = await contractHelpers.tryFetchProxy(
            hre,
            'StakeAllocator',
            'uups',
            [contracts.access.address],
            {
                constructorArgs: [contracts.forwarder.address, contracts.subjectGateway.address, contracts.rewardsDistributor.address],
                unsafeAllow: ['delegatecall'],
            },
            CACHE
        );

        DEBUG(`[${Object.keys(contracts).length}.1] stake allocator: ${contracts.stakeAllocator.address}`);

        DEBUG('Configuring configureStakeHelpers...');

        await contracts.staking.configureStakeHelpers(contracts.subjectGateway.address, contracts.stakeAllocator.address);
        DEBUG(`[${Object.keys(contracts).length}.2] configured Staking`);
        if (deployEscrow) {
            contracts.escrowFactory = await contractHelpers.tryFetchContract(hre, 'StakingEscrowFactory', [contracts.forwarder.address, contracts.staking.address], CACHE);
            DEBUG(`[${Object.keys(contracts).length}.3] escrow factory: ${contracts.escrowFactory.address}`);
        }

        contracts.agents = await contractHelpers.tryFetchProxy(
            hre,
            'AgentRegistry',
            'uups',
            [contracts.access.address, 'Forta Agents', 'FAgents'],
            {
                constructorArgs: [contracts.forwarder.address],
                unsafeAllow: 'delegatecall',
            },
            CACHE
        );

        DEBUG(`[${Object.keys(contracts).length}] agents: ${contracts.agents.address}`);

        // Upgrades
        // Agents v0.1.2

        await contracts.agents.setSubjectHandler(contracts.subjectGateway.address);

        DEBUG(`[${Object.keys(contracts).length}.1] staking for agents configured`);

        contracts.scanners = await contractHelpers.tryFetchProxy(
            hre,
            'ScannerRegistry',
            'uups',
            [contracts.access.address, 'Forta Scanners', 'FScanners'],
            {
                constructorArgs: [contracts.forwarder.address],
                unsafeAllow: 'delegatecall',
            },
            CACHE
        );

        DEBUG(`[${Object.keys(contracts).length}] scanners: ${contracts.scanners.address}`);

        await contracts.scanners.setSubjectHandler(contracts.subjectGateway.address);

        DEBUG(`[${Object.keys(contracts).length}.1] staking for scanners configured`);

        DEBUG(`[${Object.keys(contracts).length}] Deploying ScannerNodeVersion...`);
        if (deployScannerVersion) {
            contracts.scannerNodeVersion = await contractHelpers.tryFetchProxy(
                hre,
                'ScannerNodeVersion',
                'uups',
                [contracts.access.address],
                {
                    constructorArgs: [contracts.forwarder.address],
                    unsafeAllow: 'delegatecall',
                },
                CACHE
            );
            DEBUG(`[${Object.keys(contracts).length}] scanner node version: ${contracts.scannerNodeVersion.address}`);
        }

        const penaltyModes = {};
        penaltyModes.UNDEFINED = 0;
        penaltyModes.MIN_STAKE = 1;
        penaltyModes.CURRENT_STAKE = 2;
        const reasons = {};
        reasons.OPERATIONAL_SLASH = ethers.utils.id('OPERATIONAL_SLASH');
        reasons.MISCONDUCT_SLASH = ethers.utils.id('MISCONDUCT_SLASH');

        const penalties = {};
        penalties[reasons.OPERATIONAL_SLASH] = { mode: penaltyModes.MIN_STAKE, percentSlashed: '15' };
        penalties[reasons.MISCONDUCT_SLASH] = { mode: penaltyModes.CURRENT_STAKE, percentSlashed: '90' };
        const reasonIds = Object.keys(reasons).map((reason) => reasons[reason]);

        contracts.slashing = await contractHelpers.tryFetchProxy(
            hre,
            'SlashingController',
            'uups',
            [
                contracts.access.address,
                contracts.staking.address,
                contracts.subjectGateway.address,
                deployEnv.SLASHING_DEPOSIT_AMOUNT(chainId),
                deployEnv.SLASH_PERCENT_TO_PROPOSER(chainId),
                reasonIds,
                Object.keys(reasons).map((reason) => penalties[reasons[reason]]),
            ],
            {
                constructorArgs: [contracts.forwarder.address, contracts.token.address],
                unsafeAllow: 'delegatecall',
            },
            CACHE
        );
        slashParams.penaltyModes = penaltyModes;
        slashParams.reasons = reasons;
        slashParams.penalties = penalties;
        DEBUG(`[${Object.keys(contracts).length}] slashing controller: ${contracts.slashing.address}`);

        DEBUG(`Deploying ScannerPool registry...`);

        contracts.scannerPools = await contractHelpers.tryFetchProxy(
            hre,
            'ScannerPoolRegistry',
            'uups',
            [contracts.access.address, 'Forta Scanner Pools', 'FScannerPools', contracts.subjectGateway.address, deployEnv.SCANNER_REGISTRATION_DELAY(chainId)],
            {
                constructorArgs: [contracts.forwarder.address, contracts.stakeAllocator.address],
                unsafeAllow: 'delegatecall',
            },
            CACHE
        );
        await contracts.subjectGateway.setStakeSubject(SCANNER_SUBJECT, contracts.scanners.address);
        await contracts.subjectGateway.setStakeSubject(AGENT_SUBJECT, contracts.agents.address);
        await contracts.subjectGateway.setStakeSubject(SCANNER_POOL_SUBJECT, contracts.scannerPools.address);

        DEBUG(`[${Object.keys(contracts).length}] scannerPools: ${contracts.scannerPools.address}`);
        await contracts.scanners.configureMigration(deployEnv.MIGRATION_DURATION(chainId) + (await ethers.provider.getBlock('latest')).timestamp, contracts.scannerPools.address);

        DEBUG(`Deploying Dispatch...`);
        contracts.dispatch = await contractHelpers.tryFetchProxy(
            hre,
            'Dispatch',
            'uups',
            [contracts.access.address, contracts.agents.address, contracts.scanners.address, contracts.scannerPools.address],
            {
                constructorArgs: [contracts.forwarder.address],
                unsafeAllow: 'delegatecall',
            },
            CACHE
        );
        DEBUG(`[${Object.keys(contracts).length}] dispatch: ${contracts.dispatch.address}`);
    }

    // Roles dictionary
    const roles = await Promise.all(
        Object.entries({
            DEFAULT_ADMIN: ethers.constants.HashZero,
            ADMIN: ethers.utils.id('ADMIN_ROLE'),
            MINTER: ethers.utils.id('MINTER_ROLE'),
            ENS_MANAGER: ethers.utils.id('ENS_MANAGER_ROLE'),
            UPGRADER: ethers.utils.id('UPGRADER_ROLE'),
            AGENT_ADMIN: ethers.utils.id('AGENT_ADMIN_ROLE'),
            SCANNER_ADMIN: ethers.utils.id('SCANNER_ADMIN_ROLE'),
            SCANNER_POOL_ADMIN: ethers.utils.id('SCANNER_POOL_ADMIN_ROLE'),
            DISPATCHER: ethers.utils.id('DISPATCHER_ROLE'),
            SLASHER: ethers.utils.id('SLASHER_ROLE'),
            SLASHING_ARBITER: ethers.utils.id('SLASHING_ARBITER_ROLE'),
            STAKING_CONTRACT: ethers.utils.id('STAKING_CONTRACT_ROLE'),
            STAKING_ADMIN: ethers.utils.id('STAKING_ADMIN_ROLE'),
            SWEEPER: ethers.utils.id('SWEEPER_ROLE'),
            REWARDER: ethers.utils.id('REWARDER_ROLE'),
            SCANNER_VERSION: ethers.utils.id('SCANNER_VERSION_ROLE'),
            SCANNER_BETA_VERSION: ethers.utils.id('SCANNER_BETA_VERSION_ROLE'),
            SCANNER_2_SCANNER_POOL_MIGRATOR: ethers.utils.id('SCANNER_2_SCANNER_POOL_MIGRATOR_ROLE'),
            MIGRATION_EXECUTOR: ethers.utils.id('MIGRATION_EXECUTOR_ROLE'),
            ALLOCATOR_CONTRACT: ethers.utils.id('ALLOCATOR_CONTRACT_ROLE'),
        }).map((entry) => Promise.all(entry))
    ).then(Object.fromEntries);

    DEBUG(`roles fetched`);
    if (config.childChain && contracts.access && chainId !== 1 && chainId !== 137) {
        await contracts.access
            .hasRole(roles.ENS_MANAGER, deployer.address)
            .then((result) => result || contracts.access.grantRole(roles.ENS_MANAGER, deployer.address).then((tx) => tx.wait()));
    }
    // TODO: extract to task
    /*
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
            await registerNode('reverse', deployer.address, { ...contracts.ens, chainId: chainId });
            await registerNode('addr.reverse', contracts.ens.reverse.address, { ...contracts.ens, chainId: chainId });
            await registerNode('eth', deployer.address, { ...contracts.ens, chainId: chainId });
            await registerNode('forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.token.address, chainId: chainId });
            if (config.childChain) {
                await registerNode('registries.forta.eth', deployer.address, { ...contracts.ens, chainId: chainId });
                await Promise.all([
                    registerNode('access.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.access.address, chainId: chainId }),
                    registerNode('dispatch.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.dispatch.address, chainId: chainId }),
                    registerNode('forwarder.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.forwarder.address, chainId: chainId }),
                    registerNode('staking.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.staking.address, chainId: chainId }),
                    registerNode('slashing.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.staking.address, chainId: chainId }),
                    registerNode('staking-subjects.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.subjectGateway.address, chainId: chainId }),
                    registerNode('agents.registries.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.agents.address, chainId: chainId }),
                    registerNode('scanners.registries.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.scanners.address, chainId: chainId }),
                    registerNode('scanner-pools.registries.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.scannerPools.address, chainId: chainId }),
                    registerNode('scanner-node-version.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.scannerNodeVersion.address, chainId: chainId }),
                    registerNode('rewards.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.rewardsDistributor.address, chainId: chainId }),
                    registerNode('escrow.forta.eth', deployer.address, { ...contracts.ens, resolved: contracts.escrowFactory.address, chainId: chainId }),
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
        var reverseRegisters = [reverseRegister(contracts.token, 'forta.eth')];
        if (config.childChain) {
            reverseRegisters = reverseRegisters.concat([
                reverseRegister(contracts.access, 'access.forta.eth'),
                reverseRegister(contracts.dispatch, 'dispatch.forta.eth'),
                reverseRegister(contracts.staking, 'staking.forta.eth'),
                reverseRegister(contracts.slashing, 'slashing.forta.eth'),
                reverseRegister(contracts.subjectGateway, 'stake-subject-gateway.forta.eth'),
                reverseRegister(contracts.agents, 'agents.registries.forta.eth'),
                reverseRegister(contracts.scanners, 'scanners.registries.forta.eth'),
                reverseRegister(contracts.scannerPools, 'scanner-pools.registries.forta.eth'),
                reverseRegister(contracts.scannerNodeVersion, 'scanner-node-version.forta.eth'),
                reverseRegister(contracts.rewardsDistributor, 'rewards.forta.eth'),

                // contract.escrow doesn't support reverse registration (not a component)
            ]);
        }
        await Promise.all(reverseRegisters);

        DEBUG('reverse registration');
    }
    */

    return {
        provider,
        deployer,
        contracts,
        roles,
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
