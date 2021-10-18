const { ethers } = require('hardhat');
const DEBUG      = require('debug')('forta');
const utils      = require('./utils');

Array.range = function(start, stop = undefined, step = 1) {
    if (!stop) { stop = start; start = 0; }
    return start < stop ? Array(Math.ceil((stop - start) / step)).fill().map((_, i) => start + i * step) : [];
}

Array.prototype.chunk = function(size) {
    return Array.range(Math.ceil(this.length / size)).map(i => this.slice(i * size, i * size + size))
}

async function main() {
    const provider = config?.provider ?? config?.deployer?.provider ?? await utils.getDefaultProvider();
    const deployer = config?.deployer ??                               await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });

    if (!provider.network.ensAddress) {
        provider.network.ensAddress = await CACHE.get('ens-registry');
    }

    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`ENS:      ${provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG('----------------------------------------------------');

    const contracts = await Promise.all(Object.entries({
        // token:     utils.attach('Forta',           'forta.eth'                    ).then(contract => contract.connect(deployer)),
        access:    utils.attach('AccessManager',   'access.forta.eth'             ).then(contract => contract.connect(deployer)),
        alerts:    utils.attach('Alerts',          'alerts.forta.eth'             ).then(contract => contract.connect(deployer)),
        dispatch:  utils.attach('Dispatch',        'dispatch.forta.eth'           ).then(contract => contract.connect(deployer)),
        router:    utils.attach('Router',          'router.forta.eth'             ).then(contract => contract.connect(deployer)),
        // staking:   utils.attach('FortaStaking',    'staking.forta.eth'            ).then(contract => contract.connect(deployer)),
        forwarder: utils.attach('Forwarder',       'forwarder.forta.eth'          ).then(contract => contract.connect(deployer)),
        agents:    utils.attach('AgentRegistry',   'agents.registries.forta.eth'  ).then(contract => contract.connect(deployer)),
        scanners:  utils.attach('ScannerRegistry', 'scanners.registries.forta.eth').then(contract => contract.connect(deployer)),
    }).map(entry => Promise.all(entry))).then(Object.fromEntries);


    const AGENTS = Array.range(16).map(i => ({ id: i, owner: deployer.address, metadata: `test #${i}`, chainIds: [ 1 ] }));

    await Promise.all(
        AGENTS
        .map(agent => contracts.agents.interface.encodeFunctionData('createAgent', [ agent.id, agent.owner, agent.metadata, agent.chainIds ]))
        .chunk(16)
        .map(chunk => contracts.agents.multicall(chunk).then(tx => tx.wait()))
    );

    console.log('done')
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
