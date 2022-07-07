const { ethers, upgrades } = require('hardhat');
const DEBUG = require('debug')('forta:upgrade');
const utils = require('./utils');

const CHILD_FOR_PARENT_CHAIN_ID = {
    1: 137,
    5: 80001,
};

const CHILD_CHAIN_MANAGER_PROXY = {
    137: '0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa',
    80001: '0xb5505a6d998549090530911180f38aC5130101c6',
};

const ROOT_CHAIN_MANAGER = {
    1: '0x0D29aDA4c818A9f089107201eaCc6300e56E0d5c',
    5: '0xBbD7cBFA79faee899Eaf900F13C9065bF03B1A74',
};

const CONTRACTS_TO_UPGRADE = ['access'];

async function main() {
    const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    const childChainManagerProxy = CHILD_CHAIN_MANAGER_PROXY[chainId] ?? false;
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });

    if (!provider.network.ensAddress) {
        provider.network.ensAddress = await CACHE.get('ens-registry');
    }

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`ENS:      ${provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`childChainManagerProxy: ${childChainManagerProxy}`);
    DEBUG('----------------------------------------------------');

    if (name !== 'hardhat' && deployer.address === '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266') {
        throw new Error('using hardhat key for other network');
    }
    const l2Contracts = {
        forwarder: utils.attach('Forwarder', await CACHE.get('forwarder.address')).then((contract) => contract.connect(deployer)),
        access: utils.attach('AccessManager', await CACHE.get('access.address')).then((contract) => contract.connect(deployer)),
        staking: utils.attach('FortaStaking', await CACHE.get('staking.address')).then((contract) => contract.connect(deployer)),
        agents: utils.attach('AgentRegistry', await CACHE.get('agents.address')).then((contract) => contract.connect(deployer)),
        scanners: utils.attach('ScannerRegistry', await CACHE.get('scanners.address')).then((contract) => contract.connect(deployer)),
        dispatch: utils.attach('Dispatch', await CACHE.get('dispatch.address')).then((contract) => contract.connect(deployer)),
        router: utils.attach('Router', await CACHE.get('router.address')).then((contract) => contract.connect(deployer)),
        scannerNodeVersion: utils.attach('ScannerNodeVersion', await CACHE.get('scanner-node-version.address')).then((contract) => contract.connect(deployer)),
        stakingParameters: utils.attach('FortaStakingParameters', await CACHE.get('staking-parameters.address')).then((contract) => contract.connect(deployer)),
    };

    const contracts = await Promise.all(
        Object.entries({
            forta: utils.attach(childChainManagerProxy ? 'FortaBridgedPolygon' : 'Forta', await CACHE.get('forta.address')).then((contract) => contract.connect(deployer)),
            ...l2Contracts,
        }).map((entry) => Promise.all(entry))
    ).then(Object.fromEntries);

    const UPGRADER_ROLE = ethers.utils.id('UPGRADER_ROLE');
    const isUpgrader = await contracts.access?.hasRole(UPGRADER_ROLE, deployer.address);
    if (!isUpgrader && contracts.access) {
        await contracts.access.grantRole(UPGRADER_ROLE, deployer.address).then((tx) => tx.wait());
        DEBUG('Granted upgrader role to: ', deployer.address);
    }
    if (CONTRACTS_TO_UPGRADE.includes('forta')) {
        const Forta = await ethers.getContractFactory(childChainManagerProxy ? 'FortaBridgedPolygon' : 'Forta');
        DEBUG('Upgrading ', childChainManagerProxy ? 'FortaBridgedPolygon' : 'Forta');
        const newForta = await utils.performUpgrade(
            contracts.forta,
            Forta.connect(deployer),
            {
                constructorArgs: [childChainManagerProxy].filter(Boolean),
                unsafeAllow: ['delegatecall'],
                unsafeSkipStorageCheck: true,
            },
            CACHE,
            'forta'
        );
        DEBUG('newForta: ', await upgrades.erc1967.getImplementationAddress(newForta.address));

        if (!childChainManagerProxy) {
            DEBUG('Upgraded for L1, exiting...');
            return;
        }
    }

    // L2 Components --------------------------------------------------------------------------------------------
    DEBUG(CONTRACTS_TO_UPGRADE.includes('access'));
    if (CONTRACTS_TO_UPGRADE.includes('access')) {
        const AccessManager = await ethers.getContractFactory('AccessManager');
        const newAccessManager = await utils.performUpgrade(
            contracts.access,
            AccessManager.connect(deployer),
            {
                constructorArgs: [contracts.forwarder.address],
                unsafeAllow: ['delegatecall'],
            },
            CACHE,
            'access'
        );
        DEBUG('newAccessManager: ', await upgrades.erc1967.getImplementationAddress(newAccessManager.address));
    }

    if (CONTRACTS_TO_UPGRADE.includes('router')) {
        const Router = await ethers.getContractFactory('Router');
        const newRouter = await utils.performUpgrade(
            contracts.router,
            Router.connect(deployer),
            {
                constructorArgs: [contracts.forwarder.address],
                unsafeAllow: ['delegatecall'],
                unsafeSkipStorageCheck: true,
            },
            CACHE,
            'router'
        );
        DEBUG('newRouter: ', await upgrades.erc1967.getImplementationAddress(newRouter.address));
    }

    if (CONTRACTS_TO_UPGRADE.includes('agents')) {
        const AgentRegistry = await ethers.getContractFactory('AgentRegistry');
        const newAgentRegistry = await utils.performUpgrade(
            contracts.agents,
            AgentRegistry.connect(deployer),
            {
                call: {
                    fn: 'setStakeController(address)',
                    args: [contracts.staking.address],
                },
                constructorArgs: [contracts.forwarder.address],
                unsafeAllow: ['delegatecall'],
                unsafeSkipStorageCheck: true,
            },
            CACHE,
            'agents'
        );
        DEBUG('new Agent Registry: ', await upgrades.erc1967.getImplementationAddress(newAgentRegistry.address));
    }

    if (CONTRACTS_TO_UPGRADE.includes('scanners')) {
        const ScannerRegistry = await ethers.getContractFactory('ScannerRegistry');
        const newScannerRegistry = await utils.performUpgrade(
            contracts.scanners,
            ScannerRegistry.connect(deployer),
            {
                call: {
                    fn: 'setStakeController(address)',
                    args: [contracts.staking.address],
                },
                constructorArgs: [contracts.forwarder.address],
                unsafeAllow: ['delegatecall'],
                unsafeSkipStorageCheck: true,
            },
            CACHE,
            'scanners'
        );
        DEBUG('newScannerRegistry: ', await upgrades.erc1967.getImplementationAddress(newScannerRegistry.address));
    }

    if (CONTRACTS_TO_UPGRADE.includes('dispatch')) {
        const Dispatch = await ethers.getContractFactory('Dispatch');
        const newDispatch = await utils.performUpgrade(
            contracts.dispatch,
            Dispatch.connect(deployer),
            {
                constructorArgs: [contracts.forwarder.address],
                unsafeAllow: ['delegatecall'],
            },
            CACHE,
            'dispatch'
        );

        DEBUG('newDispatch: ', await upgrades.erc1967.getImplementationAddress(newDispatch.address));
    }

    if (CONTRACTS_TO_UPGRADE.includes('scanner-node-version')) {
        const ScannerNodeVersion = await ethers.getContractFactory('ScannerNodeVersion');
        const newScannerNodeVersion = await utils.performUpgrade(
            contracts.scannerNodeVersion,
            ScannerNodeVersion.connect(deployer),
            {
                constructorArgs: [contracts.forwarder.address],
                unsafeAllow: ['delegatecall'],
            },
            CACHE,
            'scanner-node-version'
        );

        DEBUG('newScannerNodeVersion: ', await upgrades.erc1967.getImplementationAddress(newScannerNodeVersion.address));
    }

    if (CONTRACTS_TO_UPGRADE.includes('staking-parameters')) {
        const StakingParameters = await ethers.getContractFactory('FortaStakingParameters');
        const newStakingParameters = await utils.performUpgrade(
            contracts.stakingParameters,
            StakingParameters.connect(deployer),
            {
                constructorArgs: [contracts.forwarder.address],
                unsafeAllow: ['delegatecall'],
            },
            CACHE,
            'staking-parameters'
        );

        DEBUG('newStakingParameters: ', await upgrades.erc1967.getImplementationAddress(newStakingParameters.address));
    }

    if (CONTRACTS_TO_UPGRADE.includes('staking')) {
        const Staking = await ethers.getContractFactory('FortaStaking');
        const newStaking = await utils.performUpgrade(
            contracts.staking,
            Staking.connect(deployer),
            {
                constructorArgs: [contracts.forwarder.address],
                unsafeAllow: ['delegatecall'],
            },
            CACHE,
            'staking'
        );

        DEBUG('newStaking: ', await upgrades.erc1967.getImplementationAddress(newStaking.address));
    }

    const vestingWallets = CONTRACTS_TO_UPGRADE.filter((x) => x.match(/vesting-.+/));
    if (vestingWallets.length > 0) {
        if (chainId !== 5 && chainId !== 1) throw new Error('Vesting wallets only in layer 1');
        const CACHE_L2 = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${CHILD_FOR_PARENT_CHAIN_ID[chainId]}` });

        for (const vestingWallet of vestingWallets) {
            const vestingContract = await utils.attach('VestingWalletV2', await CACHE.get(`${vestingWallet}.address`)).then((contract) => contract.connect(deployer));
            const VestingWalletV2 = await ethers.getContractFactory('VestingWalletV2');
            const newWallet = await utils.performUpgrade(
                vestingContract,
                VestingWalletV2.connect(deployer),
                {
                    constructorArgs: [
                        ROOT_CHAIN_MANAGER[chainId],
                        await CACHE.get('forta.address'),
                        await CACHE_L2.get('escrow-factory.address'),
                        await CACHE_L2.get('escrow-template.address'),
                    ],
                    unsafeAllow: ['delegatecall'],
                },
                CACHE,
                vestingWallet
            );
            DEBUG(`new: ${vestingWallet} impl`, await upgrades.erc1967.getImplementationAddress(newWallet.address));
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
