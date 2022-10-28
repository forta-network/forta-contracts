const { ethers } = require('hardhat');
const DEBUG = require('debug')('forta:set-staking-threshold');
const utils = require('./utils');

const SCANNER_SUBJECT = 0;
const AGENT_SUBJECT = 1;

const config = {
    subjectType: SCANNER_SUBJECT,
    min: ethers.utils.parseEther('500'),
    max: ethers.utils.parseEther('3000'),
    activated: true,
    chainId: 250, // only relevant to SCANNER_SUBJECT
};
/*
- Ethereum Mainnet (chainID: 1) -
- Polygon (chainID: 137) -
- Avalanche (chainID: 43114) -
- BSC (chainID: 56) -
- Arbitrum One (chainID: 42161) -
- Fantom Opera (chainID: 250) -
- Optimism (chainID: 10) -
*/
async function main() {
    const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });

    console.log(`Network:  ${name} (${chainId})`);
    console.log(`Deployer: ${deployer.address}`);
    console.log('----------------------------------------------------');
    if (chainId !== 80001 && chainId !== 137) {
        throw new Error('Only supported for Polygon or Mumbai');
    }

    const contracts = {
        agents: await utils.attach('AgentRegistry', await CACHE.get('agents.address')).then((contract) => contract.connect(deployer)),
        scanners: await utils.attach('ScannerRegistry', await CACHE.get('scanners.address')).then((contract) => contract.connect(deployer)),
    };
    console.log('Stake Threshold Config:');
    console.log(config);
    console.log('Setting...');

    let tx;
    switch (config.subjectType) {
        case SCANNER_SUBJECT:
            // NOTE: deployer needs to be SCANNER_ADMIN_ROLE
            tx = await contracts.scanners.setStakeThreshold({ max: config.max, min: config.min, activated: config.activated }, config.chainId);
            break;
        case AGENT_SUBJECT:
            // NOTE: deployer needs to be AGENT_ADMIN_ROLE
            tx = await contracts.agents.setStakeThreshold({ max: config.max, min: config.min, activated: config.activated });
            break;
        default:
            throw new Error('unsupported subject type: ' + config.subjectType);
    }
    DEBUG(tx);
    console.log('Set!');
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;
