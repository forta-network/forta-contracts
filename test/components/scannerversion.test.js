const { ethers } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');

const VERSION_1 = "QmW2WQi7j6c7UgJTarActp7tDNikE4B2qXtFCfLPdsgaTQ"
const VERSION_2 = "QmQhadgstSRUv7aYnN25kwRBWtxP1gB9Kowdeim32uf8Td"

describe('Scanner Node Software Version', function () {
  prepare();
  describe('verion manager', async function() {
    it('sets version', async function () {
      await expect(this.scannerNodeVersion.connect(this.accounts.admin).setScannerNodeVersion(VERSION_1))
        .to.emit(this.scannerNodeVersion, 'ScannerNodeVersionUpdated').withArgs(VERSION_1, "");
      expect(await this.scannerNodeVersion.scannerNodeVersion()).to.be.equal(VERSION_1)
      await expect(this.scannerNodeVersion.connect(this.accounts.admin).setScannerNodeVersion(VERSION_2))
        .to.emit(this.scannerNodeVersion, 'ScannerNodeVersionUpdated').withArgs(VERSION_2, VERSION_1);
    })
    it('reverts setting same version', async function () {
      this.scannerNodeVersion.connect(this.accounts.admin).setScannerNodeVersion(VERSION_1)
      await expect(this.scannerNodeVersion.connect(this.accounts.admin).setScannerNodeVersion(VERSION_1)).to.be.revertedWith("must update to different scannerNodeVersion");
    })
    it('restricted', async function () {
      await expect(this.scannerNodeVersion.connect(this.accounts.other).setScannerNodeVersion(VERSION_2)).to.be.reverted;
    })
  })
});
