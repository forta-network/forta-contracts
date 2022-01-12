const { ethers, upgrades } = require('hardhat');
const DEBUG                = require('debug')('forta');
const utils                = require('./utils');
const loadEnv              = require('./loadEnv');

upgrades.silenceWarnings();

async function main() {

    const { contracts, chainType, deployer } = await loadEnv();

    const [
        forwarderAddress,
        stakingAddress,
    ] = await Promise.all([
        contracts.forwarder?.resolvedAddress,
        contracts.staking?.resolvedAddress,
    ]);

    // contracts.token &&
    // await contracts.token.resolvedAddress.then(address => utils.getFactory(
    //     chainType & CHAIN_TYPE.ROOT ? 'Forta' : 'FortaBridgedPolygon',
    //     'forta.eth'
    // ).then(factory => utils.performUpgrade(
    //     { address },
    //     factory.connect(deployer),
    //     {
    //         unsafeAllow: 'delegatecall',
    //         constructorArgs: [],
    //     },
    // ))),

    // contracts.access &&
    // await contracts.access.resolvedAddress.then(address => utils.getFactory(
    //     'AccessManager',
    //     'access.forta.eth'
    // ).then(factory => utils.performUpgrade(
    //     { address },
    //     factory.connect(deployer),
    //     {
    //         unsafeAllow: 'delegatecall',
    //         constructorArgs: [ forwarderAddress ],
    //     },
    // ))),

    // contracts.dispatch &&
    // await contracts.dispatch.resolvedAddress.then(address => utils.getFactory(
    //     'Dispatch',
    //     'dispatch.forta.eth'
    // ).then(factory => utils.performUpgrade(
    //     { address },
    //     factory.connect(deployer),
    //     {
    //         unsafeAllow: 'delegatecall',
    //         constructorArgs: [ forwarderAddress ],
    //     },
    // ))),

    // contracts.router &&
    // await contracts.router.resolvedAddress.then(address => utils.getFactory(
    //     'Router',
    //     'router.forta.eth'
    // ).then(factory => utils.performUpgrade(
    //     { address },
    //     factory.connect(deployer),
    //     {
    //         unsafeAllow: 'delegatecall',
    //         constructorArgs: [ forwarderAddress ],
    //     },
    // ))),

    // contracts.staking &&
    // await contracts.staking.resolvedAddress.then(address => utils.getFactory(
    //     'FortaStaking',
    //     'staking.forta.eth'
    // ).then(factory => utils.performUpgrade(
    //     { address },
    //     factory.connect(deployer),
    //     {
    //         unsafeAllow: 'delegatecall',
    //         constructorArgs: [ forwarderAddress ],
    //     },
    // ))),

    // contracts.agents &&
    // await contracts.agents.resolvedAddress.then(address => utils.getFactory(
    //     'AgentRegistry',
    //     'agents.registries.forta.eth'
    // ).then(factory => utils.performUpgrade(
    //     { address },
    //     factory.connect(deployer),
    //     {
    //         unsafeAllow: 'delegatecall',
    //         constructorArgs: [ forwarderAddress ],
    //     },
    // ))),

    // contracts.scanners &&
    // await contracts.scanners.resolvedAddress.then(address => utils.getFactory(
    //     'ScannerRegistry',
    //     'scanners.registries.forta.eth'
    // ).then(factory => utils.performUpgrade(
    //     { address },
    //     factory.connect(deployer),
    //     {
    //         unsafeAllow: 'delegatecall',
    //         constructorArgs: [ forwarderAddress ],
    //     },
    // ))),

    // contracts.escrow &&
    // await contracts.escrow.resolvedAddress.then(address => utils.getFactory(
    //     'StakingEscrowFactory',
    //     'escrow.forta.eth'
    // ).then(factory => utils.performUpgrade(
    //     { address },
    //     factory.connect(deployer),
    //     {
    //         unsafeAllow: 'delegatecall',
    //         constructorArgs: [ forwarderAddress, stakingAddress ],
    //     },
    // ))),

    await Promise.all(
        Object.entries(contracts).map(([ name, contracts ]) => contracts.resolvedAddress.then(address => upgrades.erc1967.getImplementationAddress(address)
            .then(implementation => [ name, { ens: contracts.address, address, implementation} ])
            .catch(() => [ name, { ens: contracts.address, address } ])
        ))
    )
    .then(Object.fromEntries)
    .then(DEBUG);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
