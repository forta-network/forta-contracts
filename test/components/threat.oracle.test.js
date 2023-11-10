const { ethers } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');

function createAddress(address) {
    const paddedAddress = ethers.utils.hexZeroPad(address, 20);
    return paddedAddress.toLowerCase();
}

function createAddresses(addressAmount) {
    const generatedAddresses = [];
    for (let i = 1; i <= addressAmount; i++) {
        generatedAddresses.push(createAddress(i));
    }
    return generatedAddresses;
}

const mockAddresses = [...createAddresses(10)];

describe('Threat Oracles', async function () {
    prepare(/*{ stake: { agents: { min: '100', max: '500', activated: true } } }*/);

    it('registers multiple addresses to the threat oracle', async function () {
        // TODO: Update `getThreatOracle` to use `tryGet` instead
        console.log(await this.threatOracle.getThreatLevel(mockAddresses[0]));
        // expect(await this.threatOracle.getThreatLevel()).to.be.equal();

        /*
        await expect(this.agents.connect(this.accounts.manager).setFrontRunningDelay('1800'))
            .to.emit(this.agents, 'FrontRunningDelaySet')
            .withArgs(ethers.BigNumber.from('1800'));
        */
    });
})