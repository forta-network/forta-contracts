const { ethers } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');

describe('Chain Settings Registry', function () {
    prepare();

    const MAX_CHAIN_IDS_PER_UPDATE = 5;
    const supportedChainIds = [1, 29, 387, 4654, 53219];
    beforeEach(async function () {
        await this.chainSettings.connect(this.accounts.manager).updateSupportedChains(supportedChainIds, 'Metadata1');
    });
    const unsupportedChainIds = [8, 23, 3500, 90059];

    describe('Adding supported chains', function () {
        it('should allow the amount of supported chains to be updated', async function () {
            await this.chainSettings.connect(this.accounts.manager).updateSupportedChains([...unsupportedChainIds], 'Metadata1');
    
            unsupportedChainIds.forEach(async (chainId) => {
                expect(await this.chainSettings.connect(this.accounts.manager).isChainIdSupported(chainId)).to.be.equal(true);
            });
    
            expect(await this.chainSettings.connect(this.accounts.manager).getSupportedChainIdsAmount()).to.be.equal(supportedChainIds.length + unsupportedChainIds.length);
        });

        it('should not allow account that was not granted access to update supported chains', async function () {
            await expect(this.chainSettings.connect(this.accounts.user3).updateSupportedChains([...unsupportedChainIds], 'Metadata1')).to.be.revertedWith(
                `MissingRole("${this.roles.CHAIN_SETTINGS}", "${this.accounts.user3.address}")`
            );
        });

        it('should not allow to update supported chains when attempting to add too many chains', async function () {
            const additionalUnsupportedChainIds = [37, 98, 444];
            await expect(this.chainSettings.connect(this.accounts.manager).updateSupportedChains(
                [...unsupportedChainIds, ...additionalUnsupportedChainIds],
                'Metadata1'
            )).to.be.revertedWith(
                `ChainIdsAmountExceeded(${(unsupportedChainIds.length + additionalUnsupportedChainIds.length) - MAX_CHAIN_IDS_PER_UPDATE})`
            );
        });

        it('should not allow to add a chain to be supported that is already supported', async function () {
            await expect(this.chainSettings.connect(this.accounts.manager).updateSupportedChains([supportedChainIds[1]], 'Metadata2')).to.be.revertedWith(
                `ChainIdAlreadySupported(${supportedChainIds[1]})`
            );
        });

        it('should not add support for chain ids if passed chain ids contain a chain that is already supported', async function () {
            await expect(this.chainSettings.connect(this.accounts.manager).updateSupportedChains(
                [unsupportedChainIds[0], unsupportedChainIds[1], supportedChainIds[1], unsupportedChainIds[2]],
                'Metadata2'
            )).to.be.revertedWith(
                `ChainIdAlreadySupported(${supportedChainIds[1]})`
            );
    
            unsupportedChainIds.forEach(async (chainId) => {
                expect(await this.chainSettings.connect(this.accounts.manager).isChainIdSupported(chainId)).to.be.equal(false);
            });
    
            expect(await this.chainSettings.connect(this.accounts.manager).getSupportedChainIdsAmount()).to.be.equal(supportedChainIds.length);
        });

        it('should not allow to pass an empty array of chains ids to be supported', async function () {
            await expect(this.chainSettings.connect(this.accounts.manager).updateSupportedChains([], 'Metadata1')).to.be.revertedWith(
                `EmptyArray("chainIds")`
            );
        });
    });

    describe('Updating chain settings', function () {
        it('Updates the chain settings', async function () {
            await this.chainSettings.connect(this.accounts.manager).updateChainSettings(supportedChainIds, 'Metadata2');
            supportedChainIds.forEach(async (chainId) => {
                expect(await this.chainSettings.connect(this.accounts.manager).getChainIdSettings(chainId)).to.be.equal('Metadata2');
            });
    
            await this.chainSettings.connect(this.accounts.manager).updateChainSettings(supportedChainIds, 'Metadata3');
            supportedChainIds.forEach(async (chainId) => {
                expect(await this.chainSettings.connect(this.accounts.manager).getChainIdSettings(chainId)).to.be.equal('Metadata3');
            });
        });

        it('should not allow accounts that were not granted access to update chain settings', async function () {
            await expect(this.chainSettings.connect(this.accounts.user3).updateChainSettings(supportedChainIds, 'Metadata1')).to.be.revertedWith(
                `MissingRole("${this.roles.CHAIN_SETTINGS}", "${this.accounts.user3.address}")`
            );
        });

        it('should not allow settings to be updated when it is the same as current settings', async function () {
            supportedChainIds.forEach(async (chainId) => {
                expect(await this.chainSettings.connect(this.accounts.manager).updateChainSettings([chainId], 'Metadata1')).to.be.revertedWith(
                    `MetadataNotUnique("${ethers.utils.id('Metadata1')}")`
                );
            });
        });

        it('should not allow to update more chains than are supported', async function () {
            const additionalChainIds = [23, 37];
            // Including the supported chains, but should fail because passing too many chain ids
            await expect(this.chainSettings.connect(this.accounts.manager).updateChainSettings(
                [...supportedChainIds, ...additionalChainIds],
                'Metadata1'
            )).to.be.revertedWith(
                `ChainIdsAmountExceeded(${additionalChainIds.length})`
            );
        });

        it('should not allow to update chain settings for an unsupported chain', async function () {
            await expect(this.chainSettings.connect(this.accounts.manager).updateChainSettings([unsupportedChainIds[0]], 'Metadata1')).to.be.revertedWith(
                `ChainIdUnsupported(${unsupportedChainIds[0]})`
            );
        });

        it('should not allow to pass an empty array of chains ids to update chain settings', async function () {
            await expect(this.chainSettings.connect(this.accounts.manager).updateChainSettings([], 'Metadata2')).to.be.revertedWith(
                `EmptyArray("chainIds")`
            );
        });
    });
});