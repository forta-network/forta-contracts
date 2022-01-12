const { ethers } = require('hardhat');
const { BigNumber } = ethers;
const { expect } = require('chai');
const { prepare } = require('../fixture');

let scannerSubjectId;

describe('Alerts', function () {
  prepare({ minStake: '100' });
  beforeEach(async function() {
    this.accounts.getAccount('scanner');
    await this.scanners.connect(this.accounts.scanner).register(this.accounts.scanner.address, 1)
    scannerSubjectId = BigNumber.from(this.accounts.scanner.address)
    await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.SCANNER_SUBJECT_TYPE, scannerSubjectId, '100');
    await expect(this.scanners.connect(this.accounts.scanner).enableScanner(this.accounts.scanner.address, 1))
    .to.emit(this.scanners, 'ScannerEnabled').withArgs(this.accounts.scanner.address, true, 1, true);
  })
  it('scanner posts alert', async function () {
    
    await expect(this.alerts.connect(this.accounts.scanner).addAlertBatch('1','123','124','3','1','ref'))
    .to.emit(this.alerts, 'AlertBatch')
    .withArgs(ethers.utils.id('ref'), this.accounts.scanner.address, '1','123','124','3','1','ref');
  });

  it('scanner cannot post if not registered ', async function () {

    await expect(this.alerts.connect(this.accounts.user1).addAlertBatch('1','123','124','3','1','ref'))
    .to.be.revertedWith("Alerts: Scanner not enabled");
  });


  it('scanner cannot post if not enabled', async function () {
    await expect(this.scanners.connect(this.accounts.scanner).disableScanner(this.accounts.scanner.address, 1))

    await expect(this.alerts.connect(this.accounts.scanner).addAlertBatch('1','123','124','3','1','ref'))
    .to.be.revertedWith("Alerts: Scanner not enabled");
  });

  it('scanner cannot post if not staked over minimum', async function () {
    await this.staking.connect(this.accounts.admin).setMinStake(this.stakingSubjects.SCANNER_SUBJECT_TYPE, '100000');
    await expect(this.alerts.connect(this.accounts.scanner).addAlertBatch('1','123','124','3','1','ref'))
    .to.be.revertedWith("Alerts: Scanner not enabled");
  });


});
