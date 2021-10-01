const { ethers } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');


const txTimestamp = (tx) => tx.wait().then(({ blockNumber }) => ethers.provider.getBlock(blockNumber)).then(({ timestamp }) => timestamp);
const prepareCommit = (...args)  => ethers.utils.solidityKeccak256([ 'bytes32', 'address', 'string', 'uint256[]' ], args);


describe('Scanner Registry', function () {
  prepare();

  beforeEach(async function () {
    this.accounts.scanner = this.accounts.shift();
  });

  it('register', async function () {
    const SCANNER_ID = this.accounts.scanner.address;

    await expect(this.components.scanners.connect(this.accounts.scanner).register(this.accounts.user1.address))
    .to.emit(this.components.scanners, 'Transfer').withArgs(ethers.constants.AddressZero, this.accounts.user1.address, SCANNER_ID)

    expect(await this.components.scanners.ownerOf(SCANNER_ID)).to.be.equal(this.accounts.user1.address);
  });

  it('admin register', async function () {
    const SCANNER_ID = this.accounts.scanner.address;

    await expect(this.components.scanners.connect(this.accounts.manager).adminRegister(SCANNER_ID, this.accounts.user1.address))
    .to.emit(this.components.scanners, 'Transfer').withArgs(ethers.constants.AddressZero, this.accounts.user1.address, SCANNER_ID)

    expect(await this.components.scanners.ownerOf(SCANNER_ID)).to.be.equal(this.accounts.user1.address);
  });

  it('admin register - pretected', async function () {
    const SCANNER_ID = this.accounts.scanner.address;

    await expect(this.components.scanners.connect(this.accounts.user1).adminRegister(SCANNER_ID, this.accounts.user1.address))
    .to.be.revertedWith(`MissingRole("${this.roles.AGENT_ADMIN}", "${this.accounts.user1.address}")`);
  });

  describe('managers', function () {
    beforeEach(async function () {
      await expect(this.components.scanners.connect(this.accounts.scanner).register(this.accounts.user1.address)).to.be.not.reverted;
    });

    it('add manager', async function () {
      const SCANNER_ID = this.accounts.scanner.address;
      expect(await this.components.scanners.isManager(SCANNER_ID, this.accounts.user1.address)).to.be.equal(false);
      expect(await this.components.scanners.isManager(SCANNER_ID, this.accounts.user2.address)).to.be.equal(false);
      expect(await this.components.scanners.isManager(SCANNER_ID, this.accounts.user3.address)).to.be.equal(false);
      expect(await this.components.scanners.getManagerCount(SCANNER_ID)).to.be.equal(0);

      await expect(this.components.scanners.connect(this.accounts.user1).setManager(SCANNER_ID, this.accounts.user2.address, true))
      .to.emit(this.components.scanners, 'ManagerEnabled').withArgs(SCANNER_ID, this.accounts.user2.address, true);

      expect(await this.components.scanners.isManager(SCANNER_ID, this.accounts.user1.address)).to.be.equal(false);
      expect(await this.components.scanners.isManager(SCANNER_ID, this.accounts.user2.address)).to.be.equal(true);
      expect(await this.components.scanners.isManager(SCANNER_ID, this.accounts.user3.address)).to.be.equal(false);
      expect(await this.components.scanners.getManagerCount(SCANNER_ID)).to.be.equal(1);
      expect(await this.components.scanners.getManagerAt(SCANNER_ID, 0)).to.be.equal(this.accounts.user2.address);
    });

    it('remove manager', async function () {
      const SCANNER_ID = this.accounts.scanner.address;
      expect(await this.components.scanners.isManager(SCANNER_ID, this.accounts.user1.address)).to.be.equal(false);
      expect(await this.components.scanners.isManager(SCANNER_ID, this.accounts.user2.address)).to.be.equal(false);
      expect(await this.components.scanners.isManager(SCANNER_ID, this.accounts.user3.address)).to.be.equal(false);
      expect(await this.components.scanners.getManagerCount(SCANNER_ID)).to.be.equal(0);

      await expect(this.components.scanners.connect(this.accounts.user1).setManager(SCANNER_ID, this.accounts.user2.address, true))
      .to.emit(this.components.scanners, 'ManagerEnabled').withArgs(SCANNER_ID, this.accounts.user2.address, true);
      await expect(this.components.scanners.connect(this.accounts.user1).setManager(SCANNER_ID, this.accounts.user3.address, true))
      .to.emit(this.components.scanners, 'ManagerEnabled').withArgs(SCANNER_ID, this.accounts.user3.address, true);

      expect(await this.components.scanners.isManager(SCANNER_ID, this.accounts.user1.address)).to.be.equal(false);
      expect(await this.components.scanners.isManager(SCANNER_ID, this.accounts.user2.address)).to.be.equal(true);
      expect(await this.components.scanners.isManager(SCANNER_ID, this.accounts.user3.address)).to.be.equal(true);
      expect(await this.components.scanners.getManagerCount(SCANNER_ID)).to.be.equal(2);
      expect(await this.components.scanners.getManagerAt(SCANNER_ID, 0)).to.be.equal(this.accounts.user2.address);
      expect(await this.components.scanners.getManagerAt(SCANNER_ID, 1)).to.be.equal(this.accounts.user3.address);

      await expect(this.components.scanners.connect(this.accounts.user1).setManager(SCANNER_ID, this.accounts.user2.address, false))
      .to.emit(this.components.scanners, 'ManagerEnabled').withArgs(SCANNER_ID, this.accounts.user2.address, false);

      expect(await this.components.scanners.isManager(SCANNER_ID, this.accounts.user1.address)).to.be.equal(false);
      expect(await this.components.scanners.isManager(SCANNER_ID, this.accounts.user2.address)).to.be.equal(false);
      expect(await this.components.scanners.isManager(SCANNER_ID, this.accounts.user3.address)).to.be.equal(true);
      expect(await this.components.scanners.getManagerCount(SCANNER_ID)).to.be.equal(1);
      expect(await this.components.scanners.getManagerAt(SCANNER_ID, 0)).to.be.equal(this.accounts.user3.address);
    });
  });

  describe('enable and disable', async function () {
    beforeEach(async function () {
      await expect(this.components.scanners.connect(this.accounts.scanner).register(this.accounts.user1.address)).to.be.not.reverted;
    });

    describe('manager', async function () {
      it('disable', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.components.scanners.connect(this.accounts.manager).disableScanner(SCANNER_ID, 0))
        .to.emit(this.components.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, 0, false);

        expect(await this.components.scanners.isEnabled(SCANNER_ID)).to.be.equal(false);
      });

      it('re-enable', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.components.scanners.connect(this.accounts.manager).disableScanner(SCANNER_ID, 0))
        .to.emit(this.components.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, 0, false);

        await expect(this.components.scanners.connect(this.accounts.manager).enableScanner(SCANNER_ID, 0))
        .to.emit(this.components.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, 0, true);

        expect(await this.components.scanners.isEnabled(SCANNER_ID)).to.be.equal(true);
      });

      it('restricted', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.components.scanners.connect(this.accounts.other).disableScanner(SCANNER_ID, 0)).to.be.reverted;
      });
    });

    describe('self', async function () {
      it('disable', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.components.scanners.connect(this.accounts.scanner).disableScanner(SCANNER_ID, 1))
        .to.emit(this.components.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, 1, false);

        expect(await this.components.scanners.isEnabled(SCANNER_ID)).to.be.equal(false);
      });

      it('re-enable', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.components.scanners.connect(this.accounts.scanner).disableScanner(SCANNER_ID, 1))
        .to.emit(this.components.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, 1, false);

        await expect(this.components.scanners.connect(this.accounts.scanner).enableScanner(SCANNER_ID, 1))
        .to.emit(this.components.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, 1, true);

        expect(await this.components.scanners.isEnabled(SCANNER_ID)).to.be.equal(true);
      });

      it('restricted', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.components.scanners.connect(this.accounts.other).disableScanner(SCANNER_ID, 1)).to.be.reverted;
      });
    });

    describe('owner', async function () {
      it('disable', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.components.scanners.connect(this.accounts.user1).disableScanner(SCANNER_ID, 2))
        .to.emit(this.components.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, 2, false);

        expect(await this.components.scanners.isEnabled(SCANNER_ID)).to.be.equal(false);
      });

      it('re-enable', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.components.scanners.connect(this.accounts.user1).disableScanner(SCANNER_ID, 2))
        .to.emit(this.components.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, 2, false);

        await expect(this.components.scanners.connect(this.accounts.user1).enableScanner(SCANNER_ID, 2))
        .to.emit(this.components.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, 2, true);

        expect(await this.components.scanners.isEnabled(SCANNER_ID)).to.be.equal(true);
      });

      it('restricted', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.components.scanners.connect(this.accounts.other).disableScanner(SCANNER_ID, 2)).to.be.reverted;
      });
    });

    describe('manager', async function () {
      beforeEach(async function () {
        await expect(this.components.scanners.connect(this.accounts.user1).setManager(this.accounts.scanner.address, this.accounts.user2.address, true)).to.be.not.reverted;
      });

      it('disable', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.components.scanners.connect(this.accounts.user2).disableScanner(SCANNER_ID, 3))
        .to.emit(this.components.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, 3, false);

        expect(await this.components.scanners.isEnabled(SCANNER_ID)).to.be.equal(false);
      });

      it('re-enable', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.components.scanners.connect(this.accounts.user2).disableScanner(SCANNER_ID, 3))
        .to.emit(this.components.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, 3, false);

        await expect(this.components.scanners.connect(this.accounts.user2).enableScanner(SCANNER_ID, 3))
        .to.emit(this.components.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, 3, true);

        expect(await this.components.scanners.isEnabled(SCANNER_ID)).to.be.equal(true);
      });

      it('restricted', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.components.scanners.connect(this.accounts.other).disableScanner(SCANNER_ID, 3)).to.be.reverted;
      });
    });
  });
});