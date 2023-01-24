const hre = require('hardhat');
const { ethers } = hre;
const deployEnv = require('../../scripts/loadEnv');
const { durationToSeconds } = require('../../scripts/utils');
const { getDefaultDeployer } = require('../../scripts/utils/contractHelpers');
const { getRelayerAddress, getMultisigAddress } = require('../../scripts/utils/deploymentFiles');

async function main() {
    const release = '1.1.0';
    const network = await hre.ethers.provider.getNetwork();
    const chainId = network.chainId;
    console.log(chainId);
    console.log('Deploy and prepare upgrade');
    console.log('Checking for deploy config...');
    const config = {};
    const deployer = await getDefaultDeployer(hre, ethers.provider, null, network);

    config.FortaStaking_0_1_1 = {
        impl: {
            'init-args': ['deployment.access-manager', 'deployment.router', 'deployment.forta', `${durationToSeconds('1 minute')}`, deployer.address],
            opts: {
                'unsafe-allow': ['delegatecall'],
                'constructor-args': ['deployment.forwarder'],
            },
        },
    };

    config.FortaStakingParameters_0_1_1 = {
        impl: {
            'init-args': ['deployment.access-manager', 'deployment.router', 'deployment.forta-staking_0_1_1'],
            opts: {
                'unsafe-allow': ['delegatecall'],
                'constructor-args': ['deployment.forwarder'],
            },
        },
    };

    config.AgentRegistry_0_1_5 = {
        impl: {
            'init-args': ['deployment.access-manager', 'deployment.router', 'Forta Agents', 'FAgents'],
            opts: {
                'unsafe-allow': ['delegatecall'],
                'constructor-args': ['deployment.forwarder'],
            },
        },
    };

    config.ScannerRegistry_0_1_3 = {
        impl: {
            'init-args': ['deployment.access-manager', 'Forta Scanners', 'FScanners'],
            opts: {
                'unsafe-allow': ['delegatecall'],
                'constructor-args': ['deployment.forwarder'],
            },
        },
    };

    const penaltyModes = {};
    penaltyModes.UNDEFINED = '0';
    penaltyModes.MIN_STAKE = '1';
    penaltyModes.CURRENT_STAKE = '2';
    const reasons = {};
    reasons.OPERATIONAL_SLASH = ethers.utils.id('OPERATIONAL_SLASH');
    reasons.MISCONDUCT_SLASH = ethers.utils.id('MISCONDUCT_SLASH');

    const penalties = {};
    penalties[reasons.OPERATIONAL_SLASH] = { mode: penaltyModes.MIN_STAKE, percentSlashed: '15' };
    penalties[reasons.MISCONDUCT_SLASH] = { mode: penaltyModes.CURRENT_STAKE, percentSlashed: '90' };
    const reasonIds = Object.keys(reasons).map((reason) => reasons[reason]);

    config.SlashingController = {
        impl: {
            'init-args': [
                'deployment.access-manager',
                'deployment.forta-staking_0_1_1',
                'deployment.forta-staking-parameters_0_1_1',
                deployEnv.SLASHING_DEPOSIT_AMOUNT(chainId),
                deployEnv.SLASH_PERCENT_TO_PROPOSER(chainId),
                reasonIds,
                Object.keys(reasons).map((reason) => penalties[reasons[reason]]),
            ],
            opts: {
                'unsafe-allow': ['delegatecall'],
                'constructor-args': ['deployment.forwarder', 'deployment.forta'],
            },
        },
    };

    config.Dispatch_0_1_4 = {
        impl: {
            'init-args': ['deployment.access-manager', 'deployment.router', 'deployment.agent-registry_0_1_5', 'deployment.scanner-registry_0_1_3'],
            opts: {
                'unsafe-allow': ['delegatecall'],
                'constructor-args': ['deployment.forwarder'],
            },
        },
    };
    await hre.run('deploy', { release, 'manual-config': config, promotes: true });

    console.log('Configuring...');
    const { contracts, roles } = await deployEnv.loadEnv({ provider: ethers.provider, deployer });
    const multisig = getMultisigAddress(chainId);
    const relayer = getRelayerAddress(chainId);

    let result = await Promise.all(
        [
            contracts.accessManager.connect(deployer).grantRole(roles.AGENT_ADMIN, multisig),
            contracts.accessManager.connect(deployer).grantRole(roles.AGENT_ADMIN, deployer.address),
            contracts.accessManager.connect(deployer).grantRole(roles.SCANNER_ADMIN, multisig),
            contracts.accessManager.connect(deployer).grantRole(roles.SCANNER_ADMIN, deployer.address),
            contracts.accessManager.connect(deployer).grantRole(roles.DISPATCHER, relayer),
            contracts.accessManager.connect(deployer).grantRole(roles.SLASHER, multisig),
            contracts.accessManager.connect(deployer).grantRole(roles.SLASHER, deployer.address),
            contracts.accessManager.connect(deployer).grantRole(roles.STAKING_ADMIN, multisig),
            contracts.accessManager.connect(deployer).grantRole(roles.STAKING_ADMIN, deployer.address),
            contracts.fortaStakingParameters.connect(deployer).setStakeSubjectHandler(0, contracts.scannerRegistry.address),
            contracts.fortaStakingParameters.connect(deployer).setStakeSubjectHandler(1, contracts.agentRegistry.address),
            contracts.agentRegistry.connect(deployer).setStakeController(contracts.fortaStakingParameters.address),
            contracts.scannerRegistry.connect(deployer).setStakeController(contracts.fortaStakingParameters.address),
        ].map((txPromise) => txPromise.then((tx) => tx.wait()).catch(() => {}))
    );
    // console.log(result);
    console.log('txs', result.length);

    result = await Promise.all(
        [
            contracts.agentRegistry.connect(deployer).setStakeThreshold({ min: '100000000000000000000', max: '3000000000000000000000', activated: true }),
            contracts.scannerRegistry.connect(deployer).setStakeThreshold({ min: '500000000000000000000', max: '3000000000000000000000', activated: true }, 1),
            contracts.scannerRegistry.connect(deployer).setStakeThreshold({ min: '500000000000000000000', max: '3000000000000000000000', activated: true }, 10),
            contracts.scannerRegistry.connect(deployer).setStakeThreshold({ min: '500000000000000000000', max: '3000000000000000000000', activated: true }, 137),
            contracts.scannerRegistry.connect(deployer).setStakeThreshold({ min: '500000000000000000000', max: '3000000000000000000000', activated: true }, 56),
            contracts.scannerRegistry.connect(deployer).setStakeThreshold({ min: '500000000000000000000', max: '3000000000000000000000', activated: true }, 42161),
            contracts.scannerRegistry.connect(deployer).setStakeThreshold({ min: '500000000000000000000', max: '3000000000000000000000', activated: true }, 43114),
            contracts.scannerRegistry.connect(deployer).setStakeThreshold({ min: '500000000000000000000', max: '3000000000000000000000', activated: true }, 250),
        ].map((txPromise) => txPromise.then((tx) => tx.wait()).catch(() => {}))
    );
    console.log('txs', result.length);
}

module.exports = main;

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}
