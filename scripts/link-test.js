const { ethers } = require('hardhat');
const DEBUG                = require('debug')('forta');
const utils                = require('./utils');

const ADDRESS = '0x15d3c7e811582Be09Bb8673cD603Bb2F22D1e47B'
const AGENT_ID = '0x6f975c969bca1311226e30601c30f15b30e65adc4db1a7d86be11374a069f3a0'
const SCANNER_ID = '0x8f70600365cbd4fa96eb26679efdd4cfe6b3d30d'

async function main() {
    const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);

    const { name, chainId } = await provider.getNetwork();

    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${137}` });


    DEBUG(`Network:  ${name} (${chainId})`);
    //DEBUG(`ENS:      ${provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG('----------------------------------------------------');

      
    const contracts = await Promise.all(Object.entries({
        // forta: utils.attach(childChainManagerProxy ? 'FortaBridgedPolygon' : 'Forta',  await CACHE.get('forta.address') ).then(contract => contract.connect(deployer)),
        agents: utils.attach('AgentRegistry',  await CACHE.get('agents.address')  ).then(contract => contract.connect(deployer)),
        scanners: utils.attach('ScannerRegistry',await CACHE.get('scanners.address')  ).then(contract => contract.connect(deployer)),
        dispatch: utils.attach('Dispatch', await CACHE.get('dispatch.address') ).then(contract => contract.connect(deployer))
    }).map(entry => Promise.all(entry))).then(Object.fromEntries);

    
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [ADDRESS],
    });

    console.log( await contracts.agents.getAgentState(AGENT_ID))
    console.log( await contracts.scanners.getScannerState(SCANNER_ID))

    const signer = await ethers.getSigner(ADDRESS)

    const tx = await contracts.dispatch.connect(signer).link(AGENT_ID, SCANNER_ID)
    console.log(await tx.wait())
    

    

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
