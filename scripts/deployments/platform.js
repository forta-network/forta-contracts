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
const loadRoles = require('../utils/loadRoles');

upgrades.silenceWarnings();

/*********************************************************************************************************************
 *                                                Migration workflow                                                 *
 *********************************************************************************************************************/
async function migrate(config = {}) {
    const provider = config?.provider ?? config?.deployer?.provider ?? (await contractHelpers.getDefaultProvider(hre));
    const deployer = config?.deployer ?? (await contractHelpers.getDefaultDeployer(hre, provider));
    const { name, chainId } = await provider.getNetwork();
    const delay = 0;
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
    const roles = loadRoles(hre.ethers);

    DEBUG(`roles fetched`);
    if (config.childChain && contracts.access && chainId !== 1 && chainId !== 137) {
        await contracts.access
            .hasRole(roles.ENS_MANAGER, deployer.address)
            .then((result) => result || contracts.access.grantRole(roles.ENS_MANAGER, deployer.address).then((tx) => tx.wait()));
    }

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
