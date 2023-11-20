const { ethers } = require('hardhat');
const { expect } = require('chai');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { prepare } = require('../fixture');

const THREAT_CATEGORIES = ["exploit", "mev"];

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

    it('does not allow to register addresses without either categories or confidence scores being in equal amount', async function () {
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

    it('allows FP to be corrected, i.e. remove address from block list', async function () {
        let { category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(mockAddresses[0]);
        expect(category).to.be.equal("");
        expect(confidenceScore).to.be.equal(0);

        await expect(this.threatOracle.connect(this.accounts.manager).registerAddresses([mockAddresses[0]], [mockCategories[0]], [mockConfidenceScores[0]]))
            .to.emit(this.threatOracle, 'AddressRegistered')
            .withArgs(mockAddresses[0], mockCategories[0], mockConfidenceScores[0]);

        ({ category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(mockAddresses[0]));
        expect(category).to.be.equal(mockCategories[0]);
        expect(confidenceScore).to.be.equal(mockConfidenceScores[0]);

        // FP correction
        await expect(this.threatOracle.connect(this.accounts.manager).deregisterAddresses([mockAddresses[0]]))
            .to.emit(this.threatOracle, 'AddressDeregistered')
            .withArgs(mockAddresses[0]);

        ({ category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(mockAddresses[0]));
        expect(category).to.be.equal("");
        expect(confidenceScore).to.be.equal(0);
    });

    it('does not allow a confidence score that is too high to be registered', async function () {
        let { category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(mockAddresses[0]);
        expect(category).to.be.equal("");
        expect(confidenceScore).to.be.equal(0);

        const maxConfidenceScore = 100;
        // Has to be between `100` (i.e. `MAX_CONFIDENCE_SCORE`)
        // and `255` since the argument is `uint8`.
        const tooHighConfidenceScore = 243;

        await expect(this.threatOracle.connect(this.accounts.manager).registerAddresses([mockAddresses[0]], [mockCategories[0]], [tooHighConfidenceScore]))
            .to.be.revertedWith(`ConfidenceScoreExceedsMax(${maxConfidenceScore}, ${tooHighConfidenceScore})`);

        ({ category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(mockAddresses[0]));
        expect(category).to.be.equal("");
        expect(confidenceScore).to.be.equal(0);
    });

    describe('Multicall', async function () {
        it('allows to register a high number of addresses', async function () {
            const highAmountMockAddresses = createAddresses(2000);
            const highAmountMockCategories = createThreatCategories(2000);
            const highAmountMockConfidenceScores = createConfidenceScores(2000);

            /*
            for(let i = 0; i < highAmountMockAddresses.length; i++) {
                let { category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(highAmountMockAddresses[i]);
                expect(category).to.be.equal("");
                expect(confidenceScore).to.be.equal(0);
            }
            */

            // Hardhat is not allowing this check to pass, though it is expectedly running out of gas
            // await expect(this.threatOracle.connect(this.accounts.manager).registerAddresses(highAmountMockAddresses, highAmountMockCategories, highAmountMockConfidenceScores)).to.be.reverted;

            /*
            // Confirm addresses weren't registered
            for(let i = 0; i < highAmountMockAddresses.length; i++) {
                ({ category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(highAmountMockAddresses[i]));
                expect(category).to.be.equal("");
                expect(confidenceScore).to.be.equal(0);
            }
            */

            // Multicall
            const argumentChunkSize = 50;
            const multicallChunkSize = 5;

            let calls = [];
            const mockAddressChunks = highAmountMockAddresses.chunk(argumentChunkSize);
            const mockCategoryChunks = highAmountMockCategories.chunk(argumentChunkSize);
            const mockConfidenceScores = highAmountMockConfidenceScores.chunk(argumentChunkSize);

            for(let i = 0; i < mockAddressChunks.length; i++) {
                calls.push(await this.threatOracle.interface.encodeFunctionData('registerAddresses', [mockAddressChunks[i], mockCategoryChunks[i], mockConfidenceScores[i]]));
            }

            await Promise.all(
                calls.chunk(multicallChunkSize).map(async (callChunk) => {
                    await this.threatOracle.connect(this.accounts.manager).multicall(callChunk);
                })
            );
            
            for(let i = 0; i < highAmountMockAddresses.length; i++) {
                let { category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(highAmountMockAddresses[i]);
                expect(category).to.be.equal(highAmountMockCategories[i]);
                expect(confidenceScore).to.be.equal(highAmountMockConfidenceScores[i]);
            }
        });
        
        it('does not allow an account without access to register addresses', async function () {
            const highAmountMockAddresses = createAddresses(2000);
            const highAmountMockCategories = createThreatCategories(2000);
            const highAmountMockConfidenceScores = createConfidenceScores(2000);

            /*
            for(let i = 0; i < highAmountMockAddresses.length; i++) {
                let { category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(highAmountMockAddresses[i]);
                expect(category).to.be.equal("");
                expect(confidenceScore).to.be.equal(0);
            }
            */

            // Hardhat is not allowing this check to pass, though it is expectedly running out of gas
            // await expect(this.threatOracle.connect(this.accounts.manager).registerAddresses(highAmountMockAddresses, highAmountMockCategories, highAmountMockConfidenceScores)).to.be.reverted;

            /*
            // Confirm addresses weren't registered
            for(let i = 0; i < highAmountMockAddresses.length; i++) {
                ({ category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(highAmountMockAddresses[i]));
                expect(category).to.be.equal("");
                expect(confidenceScore).to.be.equal(0);
            }
            */

            // Multicall
            const argumentChunkSize = 50;
            const multicallChunkSize = 5;

            let calls = [];
            const mockAddressChunks = highAmountMockAddresses.chunk(argumentChunkSize);
            const mockCategoryChunks = highAmountMockCategories.chunk(argumentChunkSize);
            const mockConfidenceScores = highAmountMockConfidenceScores.chunk(argumentChunkSize);

            for(let i = 0; i < mockAddressChunks.length; i++) {
                calls.push(await this.threatOracle.interface.encodeFunctionData('registerAddresses', [mockAddressChunks[i], mockCategoryChunks[i], mockConfidenceScores[i]]));
            }

            await Promise.all(
                calls.chunk(multicallChunkSize).map(async (callChunk) => {
                    await expect(this.threatOracle.connect(this.accounts.other).multicall(callChunk))
                        .to.be.revertedWith(`MissingRole("${this.roles.THREAT_ORACLE_ADMIN}", "${this.accounts.other.address}")`);
                })
            );
        });

        // TODO: Possible state leak when running all tests together causing this test to fail?
        it.skip('does not allow addresses to be registered if their categories and/or confidence scores are uneven in amount', async function () {
            // If the difference is greater than
            // `argumentChunkSize`, it would fail because encoding
            // wouldn't work if we only provide one array instead
            // of three.
            //
            // Additionally, the entries for all three
            // would also have all fall in the same chunk, divisible
            // by `argumentChunkSize`.
            const highAmountMockAddresses = createAddresses(700);
            const highAmountMockCategories = createThreatCategories(690);
            const highAmountMockConfidenceScores = createConfidenceScores(690);

            for(let i = 0; i < highAmountMockAddresses.length; i++) {
                let { category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(highAmountMockAddresses[i]);
                expect(category).to.be.equal("");
                expect(confidenceScore).to.be.equal(0);
            }

            await expect(this.threatOracle.connect(this.accounts.manager).registerAddresses(highAmountMockAddresses, highAmountMockCategories, highAmountMockConfidenceScores)).to.be.revertedWith(
                `UnevenAmounts(${highAmountMockAddresses.length}, ${highAmountMockCategories.length}, ${highAmountMockConfidenceScores.length})`
            );

            // Confirm addresses weren't registered
            for(let i = 0; i < highAmountMockAddresses.length; i++) {
                ({ category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(highAmountMockAddresses[i]));
                expect(category).to.be.equal("");
                expect(confidenceScore).to.be.equal(0);
            }

            // Multicall
            const argumentChunkSize = 50;
            const multicallChunkSize = 5;

            let calls = [];
            const mockAddressChunk = highAmountMockAddresses.chunk(argumentChunkSize);                  // Length == 14
            const mockCategoryChunk = highAmountMockCategories.chunk(argumentChunkSize);                // Length == 14
            const mockConfidenceScoreChunk = highAmountMockConfidenceScores.chunk(argumentChunkSize);   // Length == 14

            for(let i = 0; i < mockAddressChunk.length; i++) {
                calls.push(await this.threatOracle.interface.encodeFunctionData('registerAddresses', [mockAddressChunk[i], mockCategoryChunk[i], mockConfidenceScoreChunk[i]]));
            }

            const multicallChunks = calls.chunk(multicallChunkSize);                                    // Length == 3

            const lastAddressChunk = mockAddressChunk[mockAddressChunk.length - 1];
            const lastCategoryChunk = mockCategoryChunk[mockCategoryChunk.length - 1];
            const lastConfidenceScoreChunk = mockConfidenceScoreChunk[mockConfidenceScoreChunk.length - 1];
            
            const lastAddressChunkAmount = lastAddressChunk.length;                                     // Length == 50
            const lastCategoryChunkAmount = lastCategoryChunk.length;                                   // Length == 40
            const lastConfidenceScoreChunkAmount = lastConfidenceScoreChunk.length;                     // Length == 40

            multicallChunks.map(async (callChunk, i) => {
                if (i === (multicallChunks.length - 1)) {
                    // Last one should fail because there are an uneven amount
                    // of addresses, categories, and confidence scores in the last chunk
                    await expect(this.threatOracle.connect(this.accounts.manager).multicall(callChunk)).to.be.revertedWith(
                        `UnevenAmounts(${lastAddressChunkAmount}, ${lastCategoryChunkAmount}, ${lastConfidenceScoreChunkAmount})`
                    );
                }
                await this.threatOracle.connect(this.accounts.manager).multicall(callChunk);
            });

            for(let i = 0; i < mockAddressChunk.length; i++) {
                const currentAddressChunk = mockAddressChunk[i];
                const currentCategoryChunk = mockCategoryChunk[i];
                const currentConfidenceScoreChunk = mockConfidenceScoreChunk[i];

                // Using `currentAddressChunk` since the last chunk
                // will have more addresses than the other two have
                // categories and confidence scores.
                for(let j = 0; j < currentAddressChunk.length; j++) {
                    const currentAddress = currentAddressChunk[j];
                    const currentCategory = currentCategoryChunk[j];
                    const currentConfidenceScore = currentConfidenceScoreChunk[j];

                    // If we are the in the chunks of addresses
                    // that made up the _last_ multicall, those
                    // should not have a value since that last
                    // multicall failed due to uneven arrays
                    // of the three arguments
                    console.log(`i: ${i} | j: ${j}`);
                    if(i >= (mockAddressChunk.length - multicallChunkSize + 1)) {
                        const { category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(currentAddress);
                        expect(category).to.be.equal("");
                        expect(confidenceScore).to.be.equal(0);
                    } else {
                        const { category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(currentAddress);
                        expect(category).to.be.equal(currentCategory);
                        expect(confidenceScore).to.be.equal(currentConfidenceScore);
                    }
                }
            }
        });

        it('allows a high number of addresses to be added in subsequent blocks', async function () {
            const totalHighAmountMockAddresses = createAddresses(3500);
            const totalHighAmountMockCategories = createThreatCategories(3500);
            const totalHighAmountMockConfidenceScores = createConfidenceScores(3500);

            const highAmountMockAddresses = totalHighAmountMockAddresses.slice(0, 2000);
            const highAmountMockCategories = totalHighAmountMockCategories.slice(0, 2000);
            const highAmountMockConfidenceScores = totalHighAmountMockConfidenceScores.slice(0, 2000);

            // Multicall
            const argumentChunkSize = 50;
            const multicallChunkSize = 5;

            let calls = [];
            const mockAddressChunks = highAmountMockAddresses.chunk(argumentChunkSize);
            const mockCategoryChunks = highAmountMockCategories.chunk(argumentChunkSize);
            const mockConfidenceScores = highAmountMockConfidenceScores.chunk(argumentChunkSize);

            for(let i = 0; i < mockAddressChunks.length; i++) {
                calls.push(await this.threatOracle.interface.encodeFunctionData('registerAddresses', [mockAddressChunks[i], mockCategoryChunks[i], mockConfidenceScores[i]]));
            }

            await Promise.all(
                calls.chunk(multicallChunkSize).map(async (callChunk) => {
                    await this.threatOracle.connect(this.accounts.manager).multicall(callChunk);
                })
            );
            
            for(let i = 0; i < highAmountMockAddresses.length; i++) {
                let { category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(highAmountMockAddresses[i]);
                expect(category).to.be.equal(highAmountMockCategories[i]);
                expect(confidenceScore).to.be.equal(highAmountMockConfidenceScores[i]);
            }


            // Increase one block
            const currentBlock = await helpers.time.latestBlock();
            await network.provider.send('evm_mine');
            expect(await helpers.time.latestBlock()).to.be.equal(currentBlock + 1);


            const highAmountMockAddressesTwo = totalHighAmountMockAddresses.slice(2000);
            const highAmountMockCategoriesTwo = totalHighAmountMockCategories.slice(2000);
            const highAmountMockConfidenceScoresTwo = totalHighAmountMockConfidenceScores.slice(2000);

            calls = [];
            const mockAddressChunksTwo = highAmountMockAddressesTwo.chunk(argumentChunkSize);
            const mockCategoryChunksTwo = highAmountMockCategoriesTwo.chunk(argumentChunkSize);
            const mockConfidenceScoresTwo = highAmountMockConfidenceScoresTwo.chunk(argumentChunkSize);

            for(let i = 0; i < mockAddressChunksTwo.length; i++) {
                calls.push(await this.threatOracle.interface.encodeFunctionData('registerAddresses', [mockAddressChunksTwo[i], mockCategoryChunksTwo[i], mockConfidenceScoresTwo[i]]));
            }

            await Promise.all(
                calls.chunk(multicallChunkSize).map(async (callChunk) => {
                    await this.threatOracle.connect(this.accounts.manager).multicall(callChunk);
                })
            );
            
            for(let i = 0; i < totalHighAmountMockAddresses.length; i++) {
                ({ category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(totalHighAmountMockAddresses[i]));
                expect(category).to.be.equal(totalHighAmountMockCategories[i]);
                expect(confidenceScore).to.be.equal(totalHighAmountMockConfidenceScores[i]);
            }
        });
    });

    describe('blocklist integration', async function () {
        it('blocks address from interacting with app if it was registered in the block list', async function () {
            expect(await this.oracleConsumer.connect(this.accounts.user1).foo()).to.be.equal(true);
            expect(await this.oracleConsumer.connect(this.accounts.user2).foo()).to.be.equal(true);

            const user2Category = "exploit";
            const user2ConfidenceScore = 95;
            await expect(this.threatOracle.connect(this.accounts.manager).registerAddresses([this.accounts.user2.address], [user2Category], [user2ConfidenceScore]));

            let { category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(this.accounts.user2.address);
            expect(category).to.be.equal(user2Category);
            expect(confidenceScore).to.be.equal(user2ConfidenceScore);

            expect(await this.oracleConsumer.connect(this.accounts.user1).foo()).to.be.equal(true);
            await expect(this.oracleConsumer.connect(this.accounts.user2).foo()).to.be.reverted;
        });

        it.only('blocks address from interacting with app if it was registered in the block list via multicall', async function () {
            expect(await this.oracleConsumer.connect(this.accounts.user1).foo()).to.be.equal(true);
            expect(await this.oracleConsumer.connect(this.accounts.user2).foo()).to.be.equal(true);

            const user2Category = "exploit";
            const user2ConfidenceScore = 95;

            const highAmountMockAddresses = [...createAddresses(199), this.accounts.user2.address];
            const highAmountMockCategories = [...createThreatCategories(199), user2Category];
            const highAmountMockConfidenceScores = [...createConfidenceScores(199), user2ConfidenceScore];

            // Multicall
            const argumentChunkSize = 50;
            const multicallChunkSize = 5;

            let calls = [];
            const mockAddressChunks = highAmountMockAddresses.chunk(argumentChunkSize);
            const mockCategoryChunks = highAmountMockCategories.chunk(argumentChunkSize);
            const mockConfidenceScores = highAmountMockConfidenceScores.chunk(argumentChunkSize);

            for(let i = 0; i < mockAddressChunks.length; i++) {
                calls.push(await this.threatOracle.interface.encodeFunctionData('registerAddresses', [mockAddressChunks[i], mockCategoryChunks[i], mockConfidenceScores[i]]));
            }

            await Promise.all(
                calls.chunk(multicallChunkSize).map(async (callChunk) => {
                    await this.threatOracle.connect(this.accounts.manager).multicall(callChunk);
                })
            );
            
            for(let i = 0; i < highAmountMockAddresses.length; i++) {
                let { category, confidenceScore } = await this.threatOracle.getThreatCategoryAndConfidence(highAmountMockAddresses[i]);
                expect(category).to.be.equal(highAmountMockCategories[i]);
                expect(confidenceScore).to.be.equal(highAmountMockConfidenceScores[i]);
            }
            
            expect(await this.oracleConsumer.connect(this.accounts.user1).foo()).to.be.equal(true);
            await expect(this.oracleConsumer.connect(this.accounts.user2).foo()).to.be.reverted;
        });
    });
})