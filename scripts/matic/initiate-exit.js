require('dotenv/config');

const { ethers } = require('hardhat');
const utils = require('../utils');
const DEBUG = require('debug')('forta:initiate-exit');

const AMOUNT = ethers.utils.parseEther('0.001');
let DESTINATION;

async function main() {
    const provider = await utils.getDefaultProvider();
    const deployer = await utils.getDefaultDeployer(provider);
    const { name, chainId } = await provider.getNetwork();
    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`Balance:  ${await provider.getBalance(deployer.address).then(ethers.utils.formatEther)}${ethers.constants.EtherSymbol}`);
    DEBUG('----------------------------------------------------');
    utils.assertNotUsingHardhatKeys(chainId, deployer);
    if (chainId !== 80001 && chainId !== 137) {
        throw new Error('Only Polygon or Mumbai supported');
    }
    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `../.cache-${chainId}` });

    const FortaL2 = await ethers.getContractFactory('FortaBridgedPolygon', deployer);
    const l2FortaAddress = await CACHE.get('forta.address');
    DEBUG('l2FortaAddress: ', l2FortaAddress);
    const fortaL2 = await FortaL2.attach(l2FortaAddress);
    DESTINATION = DESTINATION ?? deployer.address;
    DEBUG('Initiating withdrawal...');
    const tx = await fortaL2.withdrawTo(AMOUNT, DESTINATION);
    DEBUG(tx);
    console.log('Enter this tx hash in scripts/matic/exit.js :');
    console.log(tx.hash);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
