/* eslint-disable no-unexpected-multiline */
const { ethers, upgrades } = require('hardhat');
const DEBUG = require('debug')('forta:migration');
const utils = require('../../scripts/utils');
const SCANNER_SUBJECT = 0;
const AGENT_SUBJECT = 1;
const SCANNER_POOL_SUBJECT = 2;

const semver = require('semver');
const deployEnv = require('../../scripts/loadEnv');

upgrades.silenceWarnings();

/*********************************************************************************************************************
 *                                                Migration workflow                                                 *
 *********************************************************************************************************************/
async function migrate(config = {}) {
    const provider = config?.provider ?? config?.deployer?.provider ?? (await utils.getDefaultProvider());
    const deployer = config?.deployer ?? (await utils.getDefaultDeployer(provider));
    const { name, chainId } = await provider.getNetwork();
    const delay = deployEnv.DELAY[chainId] ?? 0;

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`ENS:      ${provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`Balance:  ${await provider.getBalance(deployer.address).then(ethers.utils.formatEther)}${ethers.constants.EtherSymbol}`);
    DEBUG('----------------------------------------------------');
    utils.assertNotUsingHardhatKeys(chainId, deployer);

    //const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });
    const configName = `${chainId === 5 ? './_old/' : ''}.cache-${chainId}${chainId === 5 ? '-with-components' : ''}`;
    DEBUG('configName:', configName);
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: configName });

    if (config?.force) {
        CACHE.clear();
    }
    config.childChain = config.childChain ? config.childChain : !!deployEnv.CHILD_CHAIN_MANAGER_PROXY[chainId];
    config.childChainManagerProxy = config.childChainManagerProxy ?? deployEnv.CHILD_CHAIN_MANAGER_PROXY[chainId];
    config.chainsToDeploy = config.chainsToDeploy ?? ['L1', 'L2'];
    const contracts = {};
    const slashParams = {};

    const mockRouter = await utils.deploy(await ethers.getContractFactory('MockRouter'));

    contracts.forwarder = await utils.tryFetchContract(CACHE, 'forwarder', 'Forwarder', []);

    DEBUG(`[${Object.keys(contracts).length}] forwarder: ${contracts.forwarder.address}`);

    const fortaConstructorArgs = [];
    DEBUG('config.childChain', config.childChain);
    DEBUG('config.childChainManagerProxy', config.childChainManagerProxy);

    // For test compatibility: since we need to mint and FortaBridgedPolygon does not mint(), we base our decision to deploy
    // FortaBridgedPolygon is based on the existence of childChainManagerProxy, not childChain
    config.childChainManagerProxy ? fortaConstructorArgs.push(config.childChainManagerProxy) : null;
    DEBUG(`Deploying token: ${config.childChainManagerProxy ? 'FortaBridgedPolygon' : 'Forta'}`);

    contracts.token = await utils.tryFetchProxy(CACHE, 'forta', config.childChainManagerProxy ? 'FortaBridgedPolygon' : 'Forta', 'uups', [deployer.address], {
        constructorArgs: fortaConstructorArgs,
    });

    DEBUG(`[${Object.keys(contracts).length}] forta: ${contracts.token.address}`);

    if (config.childChain || chainId === 31337) {
        contracts.access = await utils.tryFetchProxy(CACHE, 'access', 'AccessManager', 'uups', [deployer.address], {
            constructorArgs: [contracts.forwarder.address],
            unsafeAllow: 'delegatecall',
        });

        DEBUG(`[${Object.keys(contracts).length}] access: ${contracts.access.address}`);

        contracts.staking = await utils.tryFetchProxy(
            CACHE,
            'staking',
            'FortaStaking_0_1_1',
            'uups',
            [contracts.access.address, mockRouter.address, contracts.token.address, delay, deployEnv.TREASURY(chainId, deployer)],
            {
                constructorArgs: [contracts.forwarder.address],
                unsafeAllow: ['delegatecall'],
            }
        );

        DEBUG(`[${Object.keys(contracts).length}] staking: ${contracts.staking.address}`);

        contracts.subjectGateway = await utils.tryFetchProxy(CACHE, 'stake-subject-gateway', 'StakeSubjectGateway', 'uups', [contracts.access.address, contracts.staking.address], {
            constructorArgs: [contracts.forwarder.address],
            unsafeAllow: ['delegatecall'],
        });

        await contracts.staking.setStakingParametersManager(contracts.subjectGateway.address);

        DEBUG(`[${Object.keys(contracts).length}.1] stake subject gateway: ${contracts.subjectGateway.address}`);

        contracts.rewardsDistributor = await utils.tryFetchProxy(
            CACHE,
            'staking-rewards',
            'RewardsDistributor',
            'uups',
            [contracts.access.address, ...deployEnv.FEE_PARAMS(chainId)],
            {
                constructorArgs: [contracts.forwarder.address, contracts.token.address, contracts.subjectGateway.address],
                unsafeAllow: ['delegatecall'],
            }
        );

        DEBUG(`[${Object.keys(contracts).length}.1] rewardsDistributor ${contracts.rewardsDistributor.address}`);

        contracts.stakeAllocator = await utils.tryFetchProxy(CACHE, 'staking-allocator', 'StakeAllocator', 'uups', [contracts.access.address], {
            constructorArgs: [contracts.forwarder.address, contracts.subjectGateway.address, contracts.rewardsDistributor.address],
            unsafeAllow: ['delegatecall'],
        });

        DEBUG(`[${Object.keys(contracts).length}.1] stake allocator: ${contracts.stakeAllocator.address}`);

        const stakingVersion = await utils.getContractVersion(contracts.staking);
        DEBUG('agentVersion', stakingVersion);

        if (semver.gt(stakingVersion, '0.1.1')) {
            DEBUG('Configuring configureStakeHelpers...');

            await contracts.staking.configureStakeHelpers(contracts.subjectGateway.address, contracts.stakeAllocator.address);
            DEBUG(`[${Object.keys(contracts).length}.2] configured Staking`);
        }

        const forwarderAddress = await CACHE.get('forwarder.address');
        const stakingAddress = await CACHE.get('staking.address');
        contracts.escrowFactory = await utils.tryFetchContract(CACHE, 'escrow-factory', 'StakingEscrowFactory', [forwarderAddress, stakingAddress]);

        DEBUG(`[${Object.keys(contracts).length}.3] escrow factory: ${contracts.escrowFactory.address}`);

        contracts.agents = await utils.tryFetchProxy(CACHE, 'agents', 'AgentRegistry', 'uups', [contracts.access.address, 'Forta Agents', 'FAgents'], {
            constructorArgs: [contracts.forwarder.address],
            unsafeAllow: 'delegatecall',
        });

        DEBUG(`[${Object.keys(contracts).length}] agents: ${contracts.agents.address}`);

        // Upgrades
        // Agents v0.1.2

        const agentVersion = await utils.getContractVersion(contracts.agents);
        DEBUG('agentVersion', agentVersion);

        if (semver.gte(agentVersion, '0.1.2')) {
            DEBUG('Configuring stake controller...');

            await contracts.agents.connect(deployer).setSubjectHandler(contracts.subjectGateway.address);
            DEBUG('Configured stake controller');
        }

        DEBUG(`[${Object.keys(contracts).length}.1] staking for agents configured`);

        contracts.scanners = await utils.tryFetchProxy(CACHE, 'scanners', 'ScannerRegistry_0_1_3', 'uups', [contracts.access.address, 'Forta Scanners', 'FScanners'], {
            constructorArgs: [contracts.forwarder.address],
            unsafeAllow: 'delegatecall',
        });

        DEBUG(`[${Object.keys(contracts).length}] scanners: ${contracts.scanners.address}`);

        DEBUG(`[${Object.keys(contracts).length}.1] staking for scanners configured`);

        DEBUG(`[${Object.keys(contracts).length}] Deploying ScannerNodeVersion...`);

        contracts.scannerNodeVersion = await utils.tryFetchProxy(CACHE, 'scanner-node-version', 'ScannerNodeVersion', 'uups', [contracts.access.address], {
            constructorArgs: [contracts.forwarder.address],
            unsafeAllow: 'delegatecall',
        });

        DEBUG(`[${Object.keys(contracts).length}] scanner node version: ${contracts.scannerNodeVersion.address}`);
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

        contracts.slashing = await utils.tryFetchProxy(
            CACHE,
            'slashing',
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
            }
        );
        slashParams.penaltyModes = penaltyModes;
        slashParams.reasons = reasons;
        slashParams.penalties = penalties;
        DEBUG(`[${Object.keys(contracts).length}] slashing controller: ${contracts.slashing.address}`);

        DEBUG(`Deploying ScannerPool registry...`);

        contracts.scannerPools = await utils.tryFetchProxy(
            CACHE,
            'scanner-pools',
            'ScannerPoolRegistry',
            'uups',
            [contracts.access.address, 'Forta Scanner Pools', 'FScannerPools', contracts.subjectGateway.address, deployEnv.SCANNER_REGISTRATION_DELAY(chainId)],
            {
                constructorArgs: [contracts.forwarder.address, contracts.stakeAllocator.address],
                unsafeAllow: 'delegatecall',
            }
        );
        console.log('Scanner', contracts.scanners.address);
        await contracts.subjectGateway.connect(deployer).setStakeSubject(SCANNER_SUBJECT, contracts.scanners.address);
        await contracts.subjectGateway.connect(deployer).setStakeSubject(AGENT_SUBJECT, contracts.agents.address);
        await contracts.subjectGateway.connect(deployer).setStakeSubject(SCANNER_POOL_SUBJECT, contracts.scannerPools.address);

        DEBUG(`[${Object.keys(contracts).length}] scannerPools: ${contracts.scannerPools.address}`);

        DEBUG(`Deploying Dispatch...`);
        contracts.dispatch = await utils.tryFetchProxy(
            CACHE,
            'dispatch',
            'Dispatch',
            'uups',
            [contracts.access.address, contracts.agents.address, contracts.scanners.address, contracts.scannerPools.address],
            {
                constructorArgs: [contracts.forwarder.address],
                unsafeAllow: 'delegatecall',
            }
        );
        DEBUG(`[${Object.keys(contracts).length}] dispatch: ${contracts.dispatch.address}`);

        const ScannerToScannerPoolMigration = await ethers.getContractFactory('ScannerToScannerPoolMigration', deployer);
        contracts.registryMigration = await upgrades.deployProxy(ScannerToScannerPoolMigration, [contracts.access.address], {
            kind: 'uups',
            constructorArgs: [contracts.forwarder.address, contracts.scanners.address, contracts.scannerPools.address, contracts.staking.address],
            unsafeAllow: 'delegatecall',
        });
        DEBUG(`[${Object.keys(contracts).length}] registryMigration: ${contracts.registryMigration.address}`);
    }

    // Roles dictionary
    const roles = deployEnv.loadRoles();
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
