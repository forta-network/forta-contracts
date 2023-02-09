/* eslint-disable no-unexpected-multiline */
const hre = require('hardhat');
const { ethers, upgrades } = hre;
const DEBUG = require('debug')('forta:migration');
const SCANNER_SUBJECT = 0;
const AGENT_SUBJECT = 1;
const SCANNER_POOL_SUBJECT = 2;
const contractHelpers = require('../../scripts/utils/contractHelpers');
const { deploy, tryFetchContract, tryFetchProxy } = contractHelpers;
const { getDeploymentOutputWriter } = require('../../scripts/utils/deploymentFiles');
const deployEnv = require('../../scripts/loadEnv');
const loadRoles = require('../../scripts/utils/loadRoles');

upgrades.silenceWarnings();

/*********************************************************************************************************************
 *                                                Migration workflow                                                 *
 *********************************************************************************************************************/
async function migrate(config = {}) {
    const provider = config?.provider ?? config?.deployer?.provider ?? (await contractHelpers.getDefaultProvider(hre));
    const deployer = config?.deployer ?? (await contractHelpers.getDefaultDeployer(hre, provider));
    const { name, chainId } = await provider.getNetwork();
    const delay = deployEnv.DELAY[chainId] ?? 0;

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`ENS:      ${provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`Balance:  ${await provider.getBalance(deployer.address).then(ethers.utils.formatEther)}${ethers.constants.EtherSymbol}`);
    DEBUG('----------------------------------------------------');

    //const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });
    const configName = `${chainId === 5 ? './_old/' : ''}.cache-${chainId}${chainId === 5 ? '-with-components' : ''}`;
    DEBUG('configName:', configName);
    let CACHE = getDeploymentOutputWriter(chainId);
    CACHE?.clear();

    config.childChain = config.childChain ? config.childChain : !!deployEnv.CHILD_CHAIN_MANAGER_PROXY[chainId];
    config.childChainManagerProxy = config.childChainManagerProxy ?? deployEnv.CHILD_CHAIN_MANAGER_PROXY[chainId];
    config.chainsToDeploy = config.chainsToDeploy ?? ['L1', 'L2'];
    const contracts = {};
    const slashParams = {};

    const mockRouter = await deploy(hre, await ethers.getContractFactory('MockRouter'), CACHE);

    contracts.forwarder = await tryFetchContract(hre, 'Forwarder', [], CACHE);

    DEBUG(`[${Object.keys(contracts).length}] forwarder: ${contracts.forwarder.address}`);

    const fortaConstructorArgs = [];
    DEBUG('config.childChain', config.childChain);
    DEBUG('config.childChainManagerProxy', config.childChainManagerProxy);

    // For test compatibility: since we need to mint and FortaBridgedPolygon does not mint(), we base our decision to deploy
    // FortaBridgedPolygon is based on the existence of childChainManagerProxy, not childChain
    config.childChainManagerProxy ? fortaConstructorArgs.push(config.childChainManagerProxy) : null;
    DEBUG(`Deploying token: ${config.childChainManagerProxy ? 'FortaBridgedPolygon' : 'Forta'}`);

    contracts.token = await tryFetchProxy(
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
        contracts.access = await tryFetchProxy(
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

        contracts.staking = await tryFetchProxy(
            hre,
            'FortaStaking_0_1_1',
            'uups',
            [contracts.access.address, mockRouter.address, contracts.token.address, delay, deployEnv.TREASURY(chainId, deployer)],
            {
                constructorArgs: [contracts.forwarder.address],
                unsafeAllow: ['delegatecall'],
            },
            CACHE
        );

        DEBUG(`[${Object.keys(contracts).length}] staking: ${contracts.staking.address}`);

        contracts.subjectGateway = await tryFetchProxy(
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

        await contracts.staking.setStakingParametersManager(contracts.subjectGateway.address);

        DEBUG(`[${Object.keys(contracts).length}.1] stake subject gateway: ${contracts.subjectGateway.address}`);

        contracts.rewardsDistributor = await tryFetchProxy(
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

        contracts.stakeAllocator = await tryFetchProxy(
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

        contracts.agents = await tryFetchProxy(
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

        await contracts.agents.connect(deployer).setSubjectHandler(contracts.subjectGateway.address);

        DEBUG(`[${Object.keys(contracts).length}.1] staking for agents configured`);

        contracts.scanners = await tryFetchProxy(
            hre,
            'ScannerRegistry_0_1_3',
            'uups',
            [contracts.access.address, 'Forta Scanners', 'FScanners'],
            {
                constructorArgs: [contracts.forwarder.address],
                unsafeAllow: 'delegatecall',
            },
            CACHE
        );

        DEBUG(`[${Object.keys(contracts).length}] scanners: ${contracts.scanners.address}`);

        DEBUG(`[${Object.keys(contracts).length}.1] staking for scanners configured`);

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

        contracts.slashing = await tryFetchProxy(
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

        contracts.scannerPools = await tryFetchProxy(
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
        console.log('Scanner', contracts.scanners.address);
        await contracts.subjectGateway.connect(deployer).setStakeSubject(SCANNER_SUBJECT, contracts.scanners.address);
        await contracts.subjectGateway.connect(deployer).setStakeSubject(AGENT_SUBJECT, contracts.agents.address);
        await contracts.subjectGateway.connect(deployer).setStakeSubject(SCANNER_POOL_SUBJECT, contracts.scannerPools.address);

        DEBUG(`[${Object.keys(contracts).length}] scannerPools: ${contracts.scannerPools.address}`);

        DEBUG(`Deploying Dispatch...`);
        contracts.dispatch = await tryFetchProxy(
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

        const ScannerToScannerPoolMigration = await ethers.getContractFactory('ScannerToScannerPoolMigration', deployer);
        contracts.scannerToScannerPoolMigration = await upgrades.deployProxy(ScannerToScannerPoolMigration, [contracts.access.address], {
            kind: 'uups',
            constructorArgs: [contracts.forwarder.address, contracts.scanners.address, contracts.scannerPools.address, contracts.staking.address],
            unsafeAllow: 'delegatecall',
        });
        DEBUG(`[${Object.keys(contracts).length}] scannerToScannerPoolMigration: ${contracts.scannerToScannerPoolMigration.address}`);
    }

    // Roles dictionary
    const roles = loadRoles(ethers);
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
