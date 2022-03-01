const { ethers, upgrades, network } = require('hardhat');
const DEBUG                = require('debug')('forta:migration');
const utils                = require('./utils');
const SCANNER_SUBJECT = 0;
const AGENT_SUBJECT = 1;
const semver = require('semver')

upgrades.silenceWarnings();

const registerNode = async (name, owner, opts = {}) => {
    const resolved      = opts.resolved;
    const registry      = opts.registry //?? contracts.ens.registry;
    const resolver      = opts.resolver //?? contracts.ens.resolver;
    const signer        = opts.signer   ?? registry.signer ?? resolver.signer;
    const signerAddress = await signer.getAddress();
    assertNotUsingHardhatKeys(opts.chainId, signerAddress);

    const [ label, ...self ]  = name.split('.');
    const parent = self.join('.');
    DEBUG('registerNode', name)
    const parentOwner = await registry.owner(ethers.utils.namehash(parent));
    if (parentOwner != signerAddress) {
        DEBUG('Unauthorized signer, owner is: ', parentOwner)
        DEBUG('parent is: ',parent)
        DEBUG('namehash is: ', ethers.utils.namehash(parent))

        throw new Error('Unauthorized signer');
    }
    const currentOwner = await registry.owner(ethers.utils.namehash(name));
    if (currentOwner == ethers.constants.AddressZero) {
        await registry.connect(signer).setSubnodeRecord(
            ethers.utils.namehash(parent),
            ethers.utils.id(label),
            resolved ? signerAddress : owner,
            resolver.address,
            0
        ).then(tx => tx.wait())
        .catch(e => DEBUG(e))
    }
    if (resolved) {
        const currentResolved = await signer.provider.resolveName(name);
        DEBUG(resolved, currentResolved)

        if (resolved != currentResolved) {
            await resolver.connect(signer)['setAddr(bytes32,address)'](
                ethers.utils.namehash(name),
                resolved,
            ).then(tx => tx.wait())
            .catch(e => DEBUG(e))
        }

        if (signerAddress != owner) {
            await registry.connect(signer).setOwner(
                ethers.utils.namehash(name),
                owner,
            ).then(tx => tx.wait())
            .catch(e => DEBUG(e))
        }
    }
}

const reverseRegister = async (contract, name) => {
    const reverseResolved = await contract.provider.lookupAddress(contract.address);
    if (reverseResolved != name) {
        await contract.setName(
            contract.provider.network.ensAddress,
            name,
        ).then(tx => tx.wait())
        .catch(e => DEBUG(e))
    }
}

const CHILD_CHAIN_MANAGER_PROXY = {
    137:   '0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa',
    80001: '0xb5505a6d998549090530911180f38aC5130101c6',
};

const assertNotUsingHardhatKeys = (chainId, deployer) => {
    if (chainId !== 31337 && deployer.address === '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266') {
        DEBUG(deployer.address, chainId)

        throw new Error('using hardhat key for other network')
    }
}

/*********************************************************************************************************************
 *                                                Migration workflow                                                 *
 *********************************************************************************************************************/
async function main() {
    const provider = config?.provider ?? config?.deployer?.provider ?? await utils.getDefaultProvider();
    const deployer = config?.deployer ??                               await utils.getDefaultDeployer(provider);
    const { name, chainId } = await provider.getNetwork();
    DEBUG(`Network:  ${name} (${chainId})`);
    DEBUG(`ENS:      ${provider.network.ensAddress ?? 'undetected'}`);
    DEBUG(`Deployer: ${deployer.address}`);
    DEBUG(`Balance:  ${await provider.getBalance(deployer.address).then(ethers.utils.formatEther)}${ethers.constants.EtherSymbol}`);
    DEBUG('----------------------------------------------------');
    utils.assertNotUsingHardhatKeys(chainId, deployer);

    const CACHE = new utils.AsyncConf({ cwd: __dirname, configName: `.cache-${chainId}` });

    const contracts = {}


}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = migrate;