const { ethers } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');


describe('Scanner Registry', function () {
  prepare({ minStake: '100' });

  beforeEach(async function () {
    this.accounts.getAccount('scanner');
  });

  it('register', async function () {
    const SCANNER_ID = this.accounts.scanner.address;

    await expect(this.scanners.connect(this.accounts.scanner).register(this.accounts.user1.address, 1))
    .to.emit(this.scanners, 'Transfer').withArgs(ethers.constants.AddressZero, this.accounts.user1.address, SCANNER_ID)
    .to.emit(this.scanners, 'ScannerUpdated').withArgs(SCANNER_ID, 1);

    expect(await this.scanners.getScanner(SCANNER_ID)).to.be.equal(1);
    expect(await this.scanners.isRegistered(SCANNER_ID)).to.be.equal(true);
    expect(await this.scanners.ownerOf(SCANNER_ID)).to.be.equal(this.accounts.user1.address);
  });

  it('public register fails if minStake = 0', async function () {
    await expect(this.staking.connect(this.accounts.admin).setMinStake(this.stakingSubjects.SCANNER_SUBJECT_TYPE, '0')).to.not.be.reverted;
    await expect(this.scanners.connect(this.accounts.scanner).register(this.accounts.user1.address, 1))
    .to.be.revertedWith('ScannerRegistryEnable: public registration only when staking activated')

  });

  it('admin register', async function () {
    const SCANNER_ID = this.accounts.scanner.address;

    await expect(this.scanners.connect(this.accounts.manager).adminRegister(SCANNER_ID, this.accounts.user1.address, 1))
    .to.emit(this.scanners, 'Transfer').withArgs(ethers.constants.AddressZero, this.accounts.user1.address, SCANNER_ID)
    .to.emit(this.scanners, 'ScannerUpdated').withArgs(SCANNER_ID, 1);

    expect(await this.scanners.getScanner(SCANNER_ID)).to.be.equal(1);

    expect(await this.scanners.ownerOf(SCANNER_ID)).to.be.equal(this.accounts.user1.address);
  });

  it('admin register - pretected', async function () {
    const SCANNER_ID = this.accounts.scanner.address;

    await expect(this.scanners.connect(this.accounts.user1).adminRegister(SCANNER_ID, this.accounts.user1.address, 1))
    .to.be.revertedWith(`MissingRole("${this.roles.SCANNER_ADMIN}", "${this.accounts.user1.address}")`);
  });

  describe('managers', function () {
    beforeEach(async function () {
      await expect(this.scanners.connect(this.accounts.scanner).register(this.accounts.user1.address, 1)).to.be.not.reverted;
    });

    it('add manager', async function () {
      const SCANNER_ID = this.accounts.scanner.address;
      expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user1.address)).to.be.equal(false);
      expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user2.address)).to.be.equal(false);
      expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user3.address)).to.be.equal(false);
      expect(await this.scanners.getManagerCount(SCANNER_ID)).to.be.equal(0);

      await expect(this.scanners.connect(this.accounts.user1).setManager(SCANNER_ID, this.accounts.user2.address, true))
      .to.emit(this.scanners, 'ManagerEnabled').withArgs(SCANNER_ID, this.accounts.user2.address, true);

      expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user1.address)).to.be.equal(false);
      expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user2.address)).to.be.equal(true);
      expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user3.address)).to.be.equal(false);
      expect(await this.scanners.getManagerCount(SCANNER_ID)).to.be.equal(1);
      expect(await this.scanners.getManagerAt(SCANNER_ID, 0)).to.be.equal(this.accounts.user2.address);
    });

    it('remove manager', async function () {
      const SCANNER_ID = this.accounts.scanner.address;
      expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user1.address)).to.be.equal(false);
      expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user2.address)).to.be.equal(false);
      expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user3.address)).to.be.equal(false);
      expect(await this.scanners.getManagerCount(SCANNER_ID)).to.be.equal(0);

      await expect(this.scanners.connect(this.accounts.user1).setManager(SCANNER_ID, this.accounts.user2.address, true))
      .to.emit(this.scanners, 'ManagerEnabled').withArgs(SCANNER_ID, this.accounts.user2.address, true);
      await expect(this.scanners.connect(this.accounts.user1).setManager(SCANNER_ID, this.accounts.user3.address, true))
      .to.emit(this.scanners, 'ManagerEnabled').withArgs(SCANNER_ID, this.accounts.user3.address, true);

      expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user1.address)).to.be.equal(false);
      expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user2.address)).to.be.equal(true);
      expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user3.address)).to.be.equal(true);
      expect(await this.scanners.getManagerCount(SCANNER_ID)).to.be.equal(2);
      expect(await this.scanners.getManagerAt(SCANNER_ID, 0)).to.be.equal(this.accounts.user2.address);
      expect(await this.scanners.getManagerAt(SCANNER_ID, 1)).to.be.equal(this.accounts.user3.address);

      await expect(this.scanners.connect(this.accounts.user1).setManager(SCANNER_ID, this.accounts.user2.address, false))
      .to.emit(this.scanners, 'ManagerEnabled').withArgs(SCANNER_ID, this.accounts.user2.address, false);

      expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user1.address)).to.be.equal(false);
      expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user2.address)).to.be.equal(false);
      expect(await this.scanners.isManager(SCANNER_ID, this.accounts.user3.address)).to.be.equal(true);
      expect(await this.scanners.getManagerCount(SCANNER_ID)).to.be.equal(1);
      expect(await this.scanners.getManagerAt(SCANNER_ID, 0)).to.be.equal(this.accounts.user3.address);
    });
  });

  describe('enable and disable', async function () {
    beforeEach(async function () {
      const SCANNER_ID = this.accounts.scanner.address;
      await expect(this.scanners.connect(this.accounts.scanner).register(this.accounts.user1.address, 1)).to.be.not.reverted;
      await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.SCANNER_SUBJECT_TYPE, SCANNER_ID, '100');

    });

    it('isEnable is false for non registered scanners, even if staked', async function() {
      const randomScanner = ethers.Wallet.createRandom().address;
      await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.SCANNER_SUBJECT_TYPE, randomScanner, '100');
      expect(await this.scanners.isEnabled(randomScanner)).to.be.equal(false);
    });

    describe('manager', async function () {
      it('disable', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.scanners.connect(this.accounts.manager).disableScanner(SCANNER_ID, 0))
        .to.emit(this.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, false, 0, false);

        expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(false);
      });

      it('re-enable', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.scanners.connect(this.accounts.manager).disableScanner(SCANNER_ID, 0))
        .to.emit(this.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, false, 0, false);

        await expect(this.scanners.connect(this.accounts.manager).enableScanner(SCANNER_ID, 0))
        .to.emit(this.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, true, 0, true);

        expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(true);
      });

      it('restricted', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.scanners.connect(this.accounts.other).disableScanner(SCANNER_ID, 0)).to.be.reverted;
      });
    });

    describe('self', async function () {
      it('disable', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.scanners.connect(this.accounts.scanner).disableScanner(SCANNER_ID, 1))
        .to.emit(this.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, false, 1, false);

        expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(false);
      });

      it('re-enable', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.scanners.connect(this.accounts.scanner).disableScanner(SCANNER_ID, 1))
        .to.emit(this.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, false, 1, false);

        await expect(this.scanners.connect(this.accounts.scanner).enableScanner(SCANNER_ID, 1))
        .to.emit(this.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, true, 1, true);

        expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(true);
      });

      it('restricted', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.scanners.connect(this.accounts.other).disableScanner(SCANNER_ID, 1)).to.be.reverted;
      });
    });

    describe('owner', async function () {
      it('disable', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.scanners.connect(this.accounts.user1).disableScanner(SCANNER_ID, 2))
        .to.emit(this.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, false, 2, false);

        expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(false);
      });

      it('re-enable', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.scanners.connect(this.accounts.user1).disableScanner(SCANNER_ID, 2))
        .to.emit(this.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, false, 2, false);

        await expect(this.scanners.connect(this.accounts.user1).enableScanner(SCANNER_ID, 2))
        .to.emit(this.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, true, 2, true);

        expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(true);
      });

      it('restricted', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.scanners.connect(this.accounts.other).disableScanner(SCANNER_ID, 2)).to.be.reverted;
      });
    });

    describe('manager', async function () {
      beforeEach(async function () {
        await expect(this.scanners.connect(this.accounts.user1).setManager(this.accounts.scanner.address, this.accounts.user2.address, true)).to.be.not.reverted;
      });

      it('disable', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.scanners.connect(this.accounts.user2).disableScanner(SCANNER_ID, 3))
        .to.emit(this.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, false, 3, false);

        expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(false);
      });

      it('re-enable', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.scanners.connect(this.accounts.user2).disableScanner(SCANNER_ID, 3))
        .to.emit(this.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, false, 3, false);

        await expect(this.scanners.connect(this.accounts.user2).enableScanner(SCANNER_ID, 3))
        .to.emit(this.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, true, 3, true);

        expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(true);
      });

      it('restricted', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.scanners.connect(this.accounts.other).disableScanner(SCANNER_ID, 3)).to.be.reverted;
      });
    });

    describe('stake', async function () {


      it('re-enable', async function () {
        const SCANNER_ID = this.accounts.scanner.address;

        await expect(this.scanners.connect(this.accounts.scanner).disableScanner(SCANNER_ID, 1))
        .to.emit(this.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, false, 1, false);

        await expect(this.scanners.connect(this.accounts.scanner).enableScanner(SCANNER_ID, 1))
        .to.emit(this.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, true, 1, true);

        expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(true);
      });

      it('cannot enable if staked under minimum', async function () {
        const SCANNER_ID = this.accounts.scanner.address;
        const SCANNER_SUBJECT_ID = ethers.BigNumber.from(SCANNER_ID);
        await expect(this.scanners.connect(this.accounts.scanner).disableScanner(SCANNER_ID, 1))
        .to.emit(this.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, false, 1, false);
        await this.staking.connect(this.accounts.admin).setMinStake(this.stakingSubjects.SCANNER_SUBJECT_TYPE, '10000');
        await expect(this.scanners.connect(this.accounts.scanner).enableScanner(SCANNER_ID, 1))
        .to.be.revertedWith("ScannerRegistryEnable: scanner staked under minimum");
        await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.SCANNER_SUBJECT_TYPE, SCANNER_SUBJECT_ID, '10000');
        await expect(this.scanners.connect(this.accounts.scanner).enableScanner(SCANNER_ID, 1))
        .to.emit(this.scanners, 'ScannerEnabled').withArgs(SCANNER_ID, true, 1, true);
        expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(true);
      });

      it('isEnabled reacts to stake changes', async function () {
        const SCANNER_ID = this.accounts.scanner.address;
        const SCANNER_SUBJECT_ID = ethers.BigNumber.from(SCANNER_ID);
        expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(true);
        await this.staking.connect(this.accounts.admin).setMinStake(this.stakingSubjects.SCANNER_SUBJECT_TYPE, '10000');
        expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(false);
        await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.SCANNER_SUBJECT_TYPE, SCANNER_SUBJECT_ID, '10000');
        expect(await this.scanners.isEnabled(SCANNER_ID)).to.be.equal(true);
      });
    });
  });
});
