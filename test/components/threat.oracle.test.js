const { ethers } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');

const THREAT_CATEGORIES = ["exploit", "MEV"];

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

// TODO: Delete as this will be unnecessary.
function createThreatLevels(threatLevelAmount) {
    const generatedThreatLevels = [];
    for (let i = 0; i < threatLevelAmount; i++) {
        const threatLevel = Math.floor(Math.random() * 5) + 1;
        generatedThreatLevels.push(threatLevel);
    }
    return generatedThreatLevels;
}

function createThreatCategories(categoriesAmount) {
    const generatedThreatCategories = [];
    for (let i = 0; i < categoriesAmount; i++) {
        const randomInt = Math.floor(Math.random() * THREAT_CATEGORIES.length);
        const category = THREAT_CATEGORIES[randomInt];
        generatedThreatCategories.push(category);
    }
    return generatedThreatCategories;
}

function createConfidenceScores(scoresAmount) {
    const generatedConfidenceScores = [];
    for (let i = 0; i < scoresAmount; i++) {
        const randomFloat = Math.floor(Math.random() * 100);
        const confidenceScore = randomFloat + 1;
        generatedConfidenceScores.push(confidenceScore);
    }
    return generatedConfidenceScores;
}

const mockAddresses = createAddresses(10);
const mockCategories = createThreatCategories(10);
const mockConfidenceScores = createConfidenceScores(10);

describe('Threat Oracle', async function () {
    prepare(/*{ stake: { agents: { min: '100', max: '500', activated: true } } }*/);

    it('registers a single address', async function () {
        let { category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(mockAddresses[0]);
        expect(category).to.be.equal("");
        expect(confidenceScore).to.be.equal(0);

        await expect(this.threatOracle.connect(this.accounts.manager).registerAddresses([mockAddresses[0]], [mockCategories[0]], [mockConfidenceScores[0]]))
            .to.emit(this.threatOracle, 'AddressRegistered')
            .withArgs(mockAddresses[0], mockCategories[0], mockConfidenceScores[0]);

        ({ category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(mockAddresses[0]));
        expect(category).to.be.equal(mockCategories[0]);
        expect(confidenceScore).to.be.equal(mockConfidenceScores[0]);
    });

    it('registers multiple addresses', async function () {
        for (let i = 0; i < mockAddresses.length; i++) {
            let { category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(mockAddresses[i]);
            expect(category).to.be.equal("");
            expect(confidenceScore).to.be.equal(0);
        }

        await expect(this.threatOracle.connect(this.accounts.manager).registerAddresses(mockAddresses, mockCategories, mockConfidenceScores));

        for (let i = 0; i < mockAddresses.length; i++) {
            ({ category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(mockAddresses[i]));
            expect(category).to.be.equal(mockCategories[i]);
            expect(confidenceScore).to.be.equal(mockConfidenceScores[i]);
        }
    });

    it('does not allow to register addresses and threat levels if they are not equal in amount', async function () {
        for (let i = 0; i < mockAddresses.length; i++) {
            let { category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(mockAddresses[i]);
            expect(category).to.be.equal("");
            expect(confidenceScore).to.be.equal(0);
        }

        const highConfidenceScoresAmount = [...mockConfidenceScores, 40, 50];

        await expect(this.threatOracle.connect(this.accounts.manager).registerAddresses(mockAddresses, mockCategories, highConfidenceScoresAmount))
            .to.be.revertedWith(`UnevenAmounts(${mockAddresses.length}, ${mockCategories.length}, ${highConfidenceScoresAmount.length})`);

        for(let i = 0; i < mockAddresses.length; i++) {
            let { category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(mockAddresses[i]);
            expect(category).to.be.equal("");
            expect(confidenceScore).to.be.equal(0);
        }
    });

    it('does not allow an account without access control to register addresses', async function () {
        for (let i = 0; i < mockAddresses.length; i++) {
            let { category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(mockAddresses[i]);
            expect(category).to.be.equal("");
            expect(confidenceScore).to.be.equal(0);
        }

        await expect(this.threatOracle.connect(this.accounts.other).registerAddresses(mockAddresses, mockCategories, mockConfidenceScores))
            .to.be.revertedWith(`MissingRole("${this.roles.THREAT_ORACLE_ADMIN}", "${this.accounts.other.address}")`);

        for (let i = 0; i < mockAddresses.length; i++) {
            let { category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(mockAddresses[i]);
            expect(category).to.be.equal("");
            expect(confidenceScore).to.be.equal(0);
        }
    });

    it.only('allows FP to be corrected, i.e. remove address from block list', async function () {
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

    // Come back to this one once others have been updated
    it('does not allow a confidence score that is too high to be registered', async function () {});

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

        // Was testing this before course correcting
        it.only('does not allow addresses to be registered if they and threat levels are uneven in amount - with multicall', async function () {
            // Max amount before breaking was between `407` & `413`,
            // and we want it to revert initially for this test,
            // therefore we need to exceed that number
            //
            // Additionally, if the difference is greater than
            // `addressChunkSize`, it would fail because encoding
            // wouldn't work if we only provide one array instead
            // of two
            const highAmountMockAddresses = createAddresses(777);
            const highAmountMockThreatLevels = createThreatLevels(770);

            const initialAddressesRegistered = await this.threatOracle.totalAddressesRegistered();

            /*
            for(let i = 0; i < highAmountMockAddresses.length; i++) {
                const mockAddress = highAmountMockAddresses[i];
                expect(await this.threatOracle.getThreatLevel(mockAddress)).to.be.equal(0);
                expect(await this.threatOracle.isRegistered(mockAddress)).to.be.equal(false);
            }
            expect(initialAddressesRegistered).to.be.equal(0);
            */

            await expect(this.threatOracle.connect(this.accounts.manager).setThreatLevels(highAmountMockAddresses, highAmountMockThreatLevels)).to.be.revertedWith(
                `UnevenAmounts(${highAmountMockAddresses.length}, ${highAmountMockThreatLevels.length})`
            );

            /*
            // Confirm addresses weren't registered
            for(let i = 0; i < highAmountMockAddresses.length; i++) {
                const mockAddress = highAmountMockAddresses[i];
                expect(await this.threatOracle.getThreatLevel(mockAddress)).to.be.equal(0);
                expect(await this.threatOracle.isRegistered(mockAddress)).to.be.equal(false);
            }
            expect(await this.threatOracle.totalAddressesRegistered()).to.be.equal(initialAddressesRegistered);
            */

            // Multicall
            const addressChunkSize = 50;
            const multicallChunkSize = 5;

            let calls = [];
            const mockAddressChunk = highAmountMockAddresses.chunk(addressChunkSize);           // Length == 16
            const mockThreatLevelChunk = highAmountMockThreatLevels.chunk(addressChunkSize);    // Length == 16

            for(let i = 0; i < mockAddressChunk.length; i++) {
                calls.push(await this.threatOracle.interface.encodeFunctionData('setThreatLevels', [mockAddressChunk[i], mockThreatLevelChunk[i]]));
            }

            const multicallChunks = calls.chunk(multicallChunkSize);                            // Length == 4
            const lastAddressChunk = mockAddressChunk[mockAddressChunk.length - 1];
            const lastThreatLevelChunk = mockThreatLevelChunk[mockThreatLevelChunk.length - 1];
            const lastAddressChunkAmount = lastAddressChunk.length;                             // Length == 20
            const lastThreatLevelChunkAmount = lastThreatLevelChunk.length;                     // Length == 27

            multicallChunks.map(async (callChunk, i) => {
                if (i === (multicallChunks.length - 1)) {
                    // Last one should fail because there are an uneven amount
                    // of addresses and threat levels in the last chunk
                    await expect(this.threatOracle.connect(this.accounts.manager).multicall(callChunk)).to.be.revertedWith(
                        `UnevenAmounts(${lastAddressChunkAmount}, ${lastThreatLevelChunkAmount})`
                    );
                }
                await this.threatOracle.connect(this.accounts.manager).multicall(callChunk);
            });
            
            for(let i = 0; i < mockAddressChunk.length; i++) {
                const currentAddressChunk = mockAddressChunk[i];
                const currentThreatLevelChunk = mockThreatLevelChunk[i];

                for(let j = 0; j < currentAddressChunk.length; j++) {
                    const currentAddress = currentAddressChunk[j];
                    const currentThreatLevel = currentThreatLevelChunk[j];

                    if(lastAddressChunk.includes(currentAddress)) {
                        expect(await this.threatOracle.getThreatLevel(currentAddress)).to.be.equal(0);
                        expect(await this.threatOracle.isRegistered(currentAddress)).to.be.equal(false);
                    } else {
                        expect(await this.threatOracle.getThreatLevel(currentAddress)).to.be.equal(currentThreatLevel);
                        expect(await this.threatOracle.isRegistered(currentAddress)).to.be.equal(true);
                    }
                }
            }
            // expect(await this.threatOracle.totalAddressesRegistered()).to.be.equal(initialAddressesRegistered + highAmountMockAddresses.length);
        });

        it.skip('allows a high number of addresses to be added in subsequent blocks', async function () {});
    });

    describe('blocklist integration', async function () {});
})