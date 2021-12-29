const { ethers } = require('hardhat');
const { BigNumber } = ethers;
const { expect } = require('chai');
const { prepare } = require('../fixture');

let scannerSubjectId;
const SCANNER_SUBJECT_TYPE = 0;

async function registerScannerAndGetId(scanners, accounts) {
  const tx = await scanners.connect(accounts.scanner).register(accounts.scanner.address, 1)
  const receipt = await tx.wait()
  const transferEvent = receipt.events.find(x => x.event === 'Transfer')
  return transferEvent.args.tokenId
}

describe('Alerts', function () {
  prepare();
  beforeEach(async function() {
    await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.user1.address);
    await this.token.connect(this.accounts.minter).mint(this.accounts.user1.address, ethers.utils.parseEther('1000'));
    await this.token.connect(this.accounts.user1).approve(this.staking.address, ethers.constants.MaxUint256);

    this.accounts.getAccount('scanner');
    scannerSubjectId = await registerScannerAndGetId(this.scanners, this.accounts);
    await expect(this.scanners.connect(this.accounts.scanner).enableScanner(this.accounts.scanner.address, 1))
    .to.emit(this.scanners, 'ScannerEnabled').withArgs(this.accounts.scanner.address, true, 1, true);
    await this.staking.connect(this.accounts.admin).setMinStake(SCANNER_SUBJECT_TYPE, '100');
    await this.staking.connect(this.accounts.user1).deposit(SCANNER_SUBJECT_TYPE, scannerSubjectId, '100');
  })
  it('scanner posts alert', async function () {
    
    await expect(this.alerts.connect(this.accounts.scanner).addAlertBatch('1','123','124','3','1','ref'))
    .to.emit(this.alerts, 'AlertBatch')
    .withArgs(ethers.utils.id('ref'), this.accounts.scanner.address, '1','123','124','3','1','ref');
  });

  it('scanner cannot post if not registered ', async function () {

    await expect(this.alerts.connect(this.accounts.user1).addAlertBatch('1','123','124','3','1','ref'))
    .to.be.revertedWith("ERC721: owner query for nonexistent token");
  });

  it.skip('scanner cannot post if not owned by sender ', async function () {
    //TODO include check
  });


  it('scanner cannot post if not enabled', async function () {
    await expect(this.scanners.connect(this.accounts.scanner).disableScanner(this.accounts.scanner.address, 1))

    await expect(this.alerts.connect(this.accounts.scanner).addAlertBatch('1','123','124','3','1','ref'))
    .to.be.revertedWith("Alerts: Scanner not enabled");
  });

  it('scanner cannot post if not staked over minimum', async function () {
    await this.staking.connect(this.accounts.admin).setMinStake(SCANNER_SUBJECT_TYPE, '100000');
    await expect(this.alerts.connect(this.accounts.scanner).addAlertBatch('1','123','124','3','1','ref'))
    .to.be.revertedWith("Alerts: Scanner is not staked over minimum");
  });


});
