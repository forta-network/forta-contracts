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

describe('Threat Oracle', async function () {
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

    describe('Multicall', async function () {
        it('allows to register a high number of addresses via multicall', async function () {
            // Max amount before breaking was between `407` & `413`,
            // and we want it to revert initially for this test,
            // therefore we need to exceed that number
            const highAmountMockAddresses = createAddresses(2000);
            const highAmountMockThreatLevels = createThreatLevels(2000);

            const initialAddressesRegistered = await this.threatOracle.totalAddressesRegistered();

            for(let i = 0; i < highAmountMockAddresses.length; i++) {
                const mockAddress = highAmountMockAddresses[i];
                expect(await this.threatOracle.getThreatLevel(mockAddress)).to.be.equal(0);
                expect(await this.threatOracle.isRegistered(mockAddress)).to.be.equal(false);
            }
            expect(initialAddressesRegistered).to.be.equal(0);

            await expect(this.threatOracle.connect(this.accounts.manager).setThreatLevels(highAmountMockAddresses, highAmountMockThreatLevels)).to.be.reverted;

            // Confirm addresses weren't registered
            for(let i = 0; i < highAmountMockAddresses.length; i++) {
                const mockAddress = highAmountMockAddresses[i];
                expect(await this.threatOracle.getThreatLevel(mockAddress)).to.be.equal(0);
                expect(await this.threatOracle.isRegistered(mockAddress)).to.be.equal(false);
            }
            expect(await this.threatOracle.totalAddressesRegistered()).to.be.equal(initialAddressesRegistered);

            // Multicall
            const addressChunkSize = 50;
            const multicallChunkSize = 5;

            let calls = [];
            const mockAddressChunks = highAmountMockAddresses.chunk(addressChunkSize);
            const mockThreatLevelChunks = highAmountMockThreatLevels.chunk(addressChunkSize);

            for(let i = 0; i < mockAddressChunks.length; i++) {
                calls.push(await this.threatOracle.interface.encodeFunctionData('setThreatLevels', [mockAddressChunks[i], mockThreatLevelChunks[i]]));
            }

            await Promise.all(
                calls.chunk(multicallChunkSize).map(async (callChunk) => {
                    await this.threatOracle.connect(this.accounts.manager).multicall(callChunk);
                })
            );
            
            for(let i = 0; i < highAmountMockAddresses.length; i++) {
                const mockAddress = highAmountMockAddresses[i];
                const mockThreatLevel = highAmountMockThreatLevels[i];

                expect(await this.threatOracle.getThreatLevel(mockAddress)).to.be.equal(mockThreatLevel);
                expect(await this.threatOracle.isRegistered(mockAddress)).to.be.equal(true);
            }
            expect(await this.threatOracle.totalAddressesRegistered()).to.be.equal(initialAddressesRegistered + highAmountMockAddresses.length);
        });
        
        it('does not allow an account without access to register addresses - with multicall', async function () {
            // Max amount before breaking was between `407` & `413`,
            // and we want it to revert initially for this test,
            // therefore we need to exceed that number
            const highAmountMockAddresses = createAddresses(2000);
            const highAmountMockThreatLevels = createThreatLevels(2000);
    
            const initialAddressesRegistered = await this.threatOracle.totalAddressesRegistered();
    
            for(let i = 0; i < highAmountMockAddresses.length; i++) {
                const mockAddress = highAmountMockAddresses[i];
                expect(await this.threatOracle.getThreatLevel(mockAddress)).to.be.equal(0);
                expect(await this.threatOracle.isRegistered(mockAddress)).to.be.equal(false);
            }
            expect(initialAddressesRegistered).to.be.equal(0);
    
            await expect(this.threatOracle.connect(this.accounts.manager).setThreatLevels(highAmountMockAddresses, highAmountMockThreatLevels)).to.be.reverted;
    
            // Confirm addresses weren't registered
            for(let i = 0; i < highAmountMockAddresses.length; i++) {
                const mockAddress = highAmountMockAddresses[i];
                expect(await this.threatOracle.getThreatLevel(mockAddress)).to.be.equal(0);
                expect(await this.threatOracle.isRegistered(mockAddress)).to.be.equal(false);
            }
            expect(await this.threatOracle.totalAddressesRegistered()).to.be.equal(initialAddressesRegistered);
    
            // Multicall
            const addressChunkSize = 50;
            const multicallChunkSize = 5;
    
            let calls = [];
            const mockAddressChunks = highAmountMockAddresses.chunk(addressChunkSize);
            const mockThreatLevelChunks = highAmountMockThreatLevels.chunk(addressChunkSize);
    
            for(let i = 0; i < mockAddressChunks.length; i++) {
                calls.push(await this.threatOracle.interface.encodeFunctionData('setThreatLevels', [mockAddressChunks[i], mockThreatLevelChunks[i]]));
            }

            await Promise.all(
                calls.chunk(multicallChunkSize).map(async (callChunk) => {
                    await expect(this.threatOracle.connect(this.accounts.other).multicall(callChunk))
                        .to.be.revertedWith(`MissingRole("${this.roles.THREAT_ORACLE_ADMIN}", "${this.accounts.other.address}")`);
                })
            );
        });

        it.only('does not allow addresses to be registered if they and threat levels are uneven in amount - with multicall', async function () {
            // Max amount before breaking was between `407` & `413`,
            // and we want it to revert initially for this test,
            // therefore we need to exceed that number
            const highAmountMockAddresses = createAddresses(2222);
            const highAmountMockThreatLevels = createThreatLevels(2000);

            const initialAddressesRegistered = await this.threatOracle.totalAddressesRegistered();

            for(let i = 0; i < highAmountMockAddresses.length; i++) {
                const mockAddress = highAmountMockAddresses[i];
                expect(await this.threatOracle.getThreatLevel(mockAddress)).to.be.equal(0);
                expect(await this.threatOracle.isRegistered(mockAddress)).to.be.equal(false);
            }
            expect(initialAddressesRegistered).to.be.equal(0);
            
            await expect(this.threatOracle.connect(this.accounts.manager).setThreatLevels(highAmountMockAddresses, highAmountMockThreatLevels)).to.be.revertedWith(
                `UnevenAmounts(${highAmountMockAddresses.length}, ${highAmountMockThreatLevels.length})`
            );

            // Confirm addresses weren't registered
            for(let i = 0; i < highAmountMockAddresses.length; i++) {
                const mockAddress = highAmountMockAddresses[i];
                expect(await this.threatOracle.getThreatLevel(mockAddress)).to.be.equal(0);
                expect(await this.threatOracle.isRegistered(mockAddress)).to.be.equal(false);
            }
            expect(await this.threatOracle.totalAddressesRegistered()).to.be.equal(initialAddressesRegistered);

            // Multicall
            const addressChunkSize = 50;
            const multicallChunkSize = 5;

            let calls = [];
            const mockAddressChunk = highAmountMockAddresses.chunk(addressChunkSize);
            const mockThreatLevelChunk = highAmountMockThreatLevels.chunk(addressChunkSize);

            // console.log(`mockAddressChunk: ${mockAddressChunk.length}`);         // 45
            // console.log(`mockThreatLevelChunk: ${mockThreatLevelChunk.length}`); // 40

            for(let i = 0; i < mockAddressChunk.length; i++) {
                console.log(`current iteration: ${i}`);
                if (i >= mockThreatLevelChunk.length) {
                    console.log(`inside 'i >= mockThreatLevelChunk.length' check`);
                    expect(this.threatOracle.interface.encodeFunctionData('setThreatLevels', [mockAddressChunk[i], mockThreatLevelChunk[i]])).fail();
                };
                calls.push(await this.threatOracle.interface.encodeFunctionData('setThreatLevels', [mockAddressChunk[i], mockThreatLevelChunk[i]]));
            }

            /*
            const multicallChunks = calls.chunk(multicallChunkSize);

            await Promise.all(
                multicallChunks.map(async (callChunk, i) => {
                    if (i === (multicallChunks.length - 1)) {
                        await expect(this.threatOracle.connect(this.accounts.manager).multicall(callChunk)).to.be.reverted;
                    }
                    await this.threatOracle.connect(this.accounts.manager).multicall(callChunk);
                })
            );
            
            /*
            for(let i = 0; i < highAmountMockAddresses.length; i++) {
                const mockAddress = highAmountMockAddresses[i];
                const mockThreatLevel = highAmountMockThreatLevels[i];

                expect(await this.threatOracle.getThreatLevel(mockAddress)).to.be.equal(mockThreatLevel);
                expect(await this.threatOracle.isRegistered(mockAddress)).to.be.equal(true);
            }
            expect(await this.threatOracle.totalAddressesRegistered()).to.be.equal(initialAddressesRegistered + highAmountMockAddresses.length);
            */
        });

        it.skip('allows a high number of addresses to be added in subsequent blocks', async function () {});
    })
})