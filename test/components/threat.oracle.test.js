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

function createThreatLevels(threatLevelAmount) {
    const generatedThreatLevels = [];
    for (let i = 0; i < threatLevelAmount; i++) {
        const threatLevel = Math.floor(Math.random() * 5) + 1;
        generatedThreatLevels.push(threatLevel);
    }
    return generatedThreatLevels;
}

const mockAddresses = createAddresses(10);
const mockThreatLevels = createThreatLevels(10);

describe('Threat Oracles', async function () {
    prepare(/*{ stake: { agents: { min: '100', max: '500', activated: true } } }*/);

    it('registers a single address', async function () {
        const initialAddressesRegistered = await this.threatOracle.totalAddressesRegistered();

        expect(await this.threatOracle.getThreatLevel(mockAddresses[0])).to.be.equal(0);
        expect(await this.threatOracle.isRegistered(mockAddresses[0])).to.be.equal(false);
        expect(initialAddressesRegistered).to.be.equal(0);

        await expect(this.threatOracle.connect(this.accounts.manager).setThreatLevels([mockAddresses[0]], [mockThreatLevels[0]]))
            .to.emit(this.threatOracle, 'AddressThreatLevelSet')
            .withArgs(mockAddresses[0], mockThreatLevels[0]);

        expect(await this.threatOracle.getThreatLevel(mockAddresses[0])).to.be.equal(mockThreatLevels[0]);
        expect(await this.threatOracle.isRegistered(mockAddresses[0])).to.be.equal(true);
        expect(await this.threatOracle.totalAddressesRegistered()).to.be.equal(initialAddressesRegistered + 1);
    });

    it('registers multiple addresses', async function () {
        const initialAddressesRegistered = await this.threatOracle.totalAddressesRegistered();

        for(let i = 0; i < mockAddresses.length; i++) {
            const mockAddress = mockAddresses[i];
            expect(await this.threatOracle.getThreatLevel(mockAddress)).to.be.equal(0);
            expect(await this.threatOracle.isRegistered(mockAddress)).to.be.equal(false);
        }
        expect(initialAddressesRegistered).to.be.equal(0);

        await this.threatOracle.connect(this.accounts.manager).setThreatLevels(mockAddresses, mockThreatLevels);
        
        for(let i = 0; i < mockAddresses.length; i++) {
            const mockAddress = mockAddresses[i];
            const mockThreatLevel = mockThreatLevels[i];

            expect(await this.threatOracle.getThreatLevel(mockAddress)).to.be.equal(mockThreatLevel);
            expect(await this.threatOracle.isRegistered(mockAddress)).to.be.equal(true);
        }
        expect(await this.threatOracle.totalAddressesRegistered()).to.be.equal(initialAddressesRegistered + mockAddresses.length);
    });

    it('does not allow to register addresses and threat levels if they are not equal in amount', async function () {
        const initialAddressesRegistered = await this.threatOracle.totalAddressesRegistered();

        for(let i = 0; i < mockAddresses.length; i++) {
            const mockAddress = mockAddresses[i];

            expect(await this.threatOracle.getThreatLevel(mockAddress)).to.be.equal(0);
            expect(await this.threatOracle.isRegistered(mockAddress)).to.be.equal(false);
        }
        expect(initialAddressesRegistered).to.be.equal(0);

        const highThreatLevelsAmount = [...mockThreatLevels, 4, 5];

        await expect(this.threatOracle.connect(this.accounts.manager).setThreatLevels(mockAddresses, highThreatLevelsAmount))
            .to.be.revertedWith(`UnevenAmounts(${mockAddresses.length}, ${highThreatLevelsAmount.length})`);

        for(let i = 0; i < mockAddresses.length; i++) {
            const mockAddress = mockAddresses[i];
            
            expect(await this.threatOracle.getThreatLevel(mockAddress)).to.be.equal(0);
            expect(await this.threatOracle.isRegistered(mockAddress)).to.be.equal(false);
        }
        expect(initialAddressesRegistered).to.be.equal(0);
    });

    it('does not allow an account without access control to register addresses', async function () {
        const initialAddressesRegistered = await this.threatOracle.totalAddressesRegistered();

        expect(await this.threatOracle.getThreatLevel(mockAddresses[0])).to.be.equal(0);
        expect(await this.threatOracle.isRegistered(mockAddresses[0])).to.be.equal(false);
        expect(initialAddressesRegistered).to.be.equal(0);

        await expect(this.threatOracle.connect(this.accounts.other).setThreatLevels([mockAddresses[0]], [mockThreatLevels[0]]))
            .to.be.revertedWith(`MissingRole("${this.roles.THREAT_ORACLE_ADMIN}", "${this.accounts.other.address}")`);

        expect(await this.threatOracle.getThreatLevel(mockAddresses[0])).to.be.equal(0);
        expect(await this.threatOracle.isRegistered(mockAddresses[0])).to.be.equal(false);
        expect(initialAddressesRegistered).to.be.equal(0);
    });

    it('allows FP to be corrected - lower existing threat level to zero', async function () {
        const initialAddressesRegistered = await this.threatOracle.totalAddressesRegistered();

        expect(await this.threatOracle.getThreatLevel(mockAddresses[0])).to.be.equal(0);
        expect(await this.threatOracle.isRegistered(mockAddresses[0])).to.be.equal(false);
        expect(initialAddressesRegistered).to.be.equal(0);

        await expect(this.threatOracle.connect(this.accounts.manager).setThreatLevels([mockAddresses[0]], [mockThreatLevels[0]]))
            .to.emit(this.threatOracle, 'AddressThreatLevelSet')
            .withArgs(mockAddresses[0], mockThreatLevels[0]);

        expect(await this.threatOracle.getThreatLevel(mockAddresses[0])).to.be.equal(mockThreatLevels[0]);
        expect(await this.threatOracle.isRegistered(mockAddresses[0])).to.be.equal(true);
        expect(await this.threatOracle.totalAddressesRegistered()).to.be.equal(initialAddressesRegistered + 1);

        // FP correction
        await expect(this.threatOracle.connect(this.accounts.manager).setThreatLevels([mockAddresses[0]], [0]))
            .to.emit(this.threatOracle, 'AddressThreatLevelSet')
            .withArgs(mockAddresses[0], 0);

        expect(await this.threatOracle.getThreatLevel(mockAddresses[0])).to.be.equal(0);
        expect(await this.threatOracle.isRegistered(mockAddresses[0])).to.be.equal(true);
        expect(await this.threatOracle.totalAddressesRegistered()).to.be.equal(initialAddressesRegistered + 1);
    });
})