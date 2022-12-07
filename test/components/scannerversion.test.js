const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');
const { deploy } = require('../../scripts/utils');

const VERSION_1 = 'QmW2WQi7j6c7UgJTarActp7tDNikE4B2qXtFCfLPdsgaTQ';
const VERSION_2 = 'QmQhadgstSRUv7aYnN25kwRBWtxP1gB9Kowdeim32uf8Td';

describe('Scanner Node Software Version', function () {
    prepare();
    describe('version manager', async function () {
        it('sets version', async function () {
            await expect(this.scannerNodeVersion.connect(this.accounts.admin).setScannerNodeVersion(VERSION_1))
                .to.emit(this.scannerNodeVersion, 'ScannerNodeVersionUpdated')
                .withArgs(VERSION_1, '');
            expect(await this.scannerNodeVersion.scannerNodeVersion()).to.be.equal(VERSION_1);
            await expect(this.scannerNodeVersion.connect(this.accounts.admin).setScannerNodeVersion(VERSION_2))
                .to.emit(this.scannerNodeVersion, 'ScannerNodeVersionUpdated')
                .withArgs(VERSION_2, VERSION_1);
        });
        it('reverts setting same version', async function () {
            this.scannerNodeVersion.connect(this.accounts.admin).setScannerNodeVersion(VERSION_1);
            await expect(this.scannerNodeVersion.connect(this.accounts.admin).setScannerNodeVersion(VERSION_1)).to.be.revertedWith('SameScannerNodeVersion()');
        });
        it('restricted', async function () {
            await expect(this.scannerNodeVersion.connect(this.accounts.other).setScannerNodeVersion(VERSION_2)).to.be.reverted;
        });
    });

    describe('beta version manager', async function () {
        it('sets version', async function () {
            await expect(this.scannerNodeVersion.connect(this.accounts.admin).setScannerNodeBetaVersion(VERSION_1))
                .to.emit(this.scannerNodeVersion, 'ScannerNodeBetaVersionUpdated')
                .withArgs(VERSION_1, '');
            expect(await this.scannerNodeVersion.scannerNodeBetaVersion()).to.be.equal(VERSION_1);
            await expect(this.scannerNodeVersion.connect(this.accounts.admin).setScannerNodeBetaVersion(VERSION_2))
                .to.emit(this.scannerNodeVersion, 'ScannerNodeBetaVersionUpdated')
                .withArgs(VERSION_2, VERSION_1);
        });
        it('reverts setting same version', async function () {
            this.scannerNodeVersion.connect(this.accounts.admin).setScannerNodeBetaVersion(VERSION_1);
            await expect(this.scannerNodeVersion.connect(this.accounts.admin).setScannerNodeBetaVersion(VERSION_1)).to.be.revertedWith('SameScannerNodeVersion()');
        });
        it('restricted', async function () {
            await expect(this.scannerNodeVersion.connect(this.accounts.other).setScannerNodeBetaVersion(VERSION_2)).to.be.reverted;
        });
    });

    describe('upgrade', async function () {
        it('upgrades', async function () {
            const mockRouter = await deploy(await ethers.getContractFactory('MockRouter'));
            const ScannerVersion_0_1_0 = await ethers.getContractFactory('ScannerNodeVersion_0_1_0');
            const originalScannerVersion = await upgrades.deployProxy(ScannerVersion_0_1_0, [this.contracts.access.address, mockRouter.address], {
                kind: 'uups',
                constructorArgs: [this.contracts.forwarder.address],
                unsafeAllow: ['delegatecall'],
            });
            await originalScannerVersion.deployed();
            await originalScannerVersion.connect(this.accounts.admin).setScannerNodeVersion(VERSION_1);
            expect(await originalScannerVersion.scannerNodeVersion()).to.equal(VERSION_1);

            const NewImplementation = await ethers.getContractFactory('ScannerNodeVersion');
            const newScannerVersion = await upgrades.upgradeProxy(originalScannerVersion.address, NewImplementation, {
                constructorArgs: [this.contracts.forwarder.address],
                unsafeAllow: ['delegatecall'],
            });
            await newScannerVersion.connect(this.accounts.admin).setScannerNodeBetaVersion(VERSION_2);
            expect(await newScannerVersion.scannerNodeVersion()).to.equal(VERSION_1);
            expect(await newScannerVersion.scannerNodeBetaVersion()).to.equal(VERSION_2);
        });
    });
});
