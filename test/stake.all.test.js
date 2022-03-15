const { ethers } = require('hardhat');
const { expect, assert } = require('chai');
const { prepare } = require('./fixture');
const { BigNumber } = require('@ethersproject/bignumber')
const { formatEther, parseEther } = require('@ethersproject/units')
const stakeAll = require('../scripts/stake-all.js');

const TEST_SCANNERS = ethers.BigNumber.from('200');
const DEFAULT_STAKE = parseEther('500')

describe('Stake all', function () {
    prepare({ stake: { min: '100', max: '1000', activated: false }});
    
    before(async function() {
        console.log('Minting', TEST_SCANNERS.mul(DEFAULT_STAKE).toString())
        const [signer] = await ethers.getSigners();
        await this.contracts.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, signer.address)
        await this.contracts.token.connect(this.accounts.minter).mint(signer.address, TEST_SCANNERS.mul(DEFAULT_STAKE))
        console.log('Creating scanners')
        for (var i = 0; i < TEST_SCANNERS.toNumber(); i++) {
            
            const id = ethers.Wallet.createRandom().address;
            const tx = await this.contracts.scanners.connect(this.accounts.manager).adminRegister(id, this.accounts.manager.address, 1, `metadata${i}`);
            if (i === 0) {
                //console.log(tx)
                firstTx = tx.hash;
                console.log(firstTx);
                // console.log(signer);
                // console.log(await signer.provider.getTransactionReceipt(firstTx));
            }
            //console.log(await tx.wait());
            if (firstTx !== 0) {
                await signer.provider.getTransactionReceipt(firstTx);
                
            }
            
        }
    })
    
    it('stakes all scanners', async function() {
        const [signer] = await ethers.getSigners()
        await stakeAll({ contracts: this.contracts, subjectType: 0, defaultStake: DEFAULT_STAKE, firstTx: firstTx, provider: signer.provider });
        
    })
    
    
});
