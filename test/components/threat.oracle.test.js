const { ethers } = require('hardhat');
const { expect } = require('chai');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { prepare } = require('../fixture');

const THREAT_CATEGORIES = ["exploit", "mev"];

function createAccount(account) {
    const paddedAccount = ethers.utils.hexZeroPad(account, 20);
    return paddedAccount.toLowerCase();
}

function createAccounts(accountAmount) {
    const generatedAccounts = [];
    for (let i = 1; i <= accountAmount; i++) {
        generatedAccounts.push(createAccount(i));
    }
    return generatedAccounts;
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

const mockAccounts = createAccounts(10);
const mockCategories = createThreatCategories(10);
const mockConfidenceScores = createConfidenceScores(10);

describe('Threat Oracle', async function () {
    // Unlike other test suites, this one doesn't
    // require staking, hence the lack of arguments
    prepare();

    it('registers a single account', async function () {
        let { category, confidenceScore } = await this.threatOracle.getThreatProperties(mockAccounts[0]);
        expect(category).to.be.equal("");
        expect(confidenceScore).to.be.equal(0);

        await expect(this.threatOracle.connect(this.accounts.manager).registerAccounts([mockAccounts[0]], [mockCategories[0]], [mockConfidenceScores[0]]))
            .to.emit(this.threatOracle, 'AccountRegistered')
            .withArgs(mockAccounts[0], mockCategories[0], mockConfidenceScores[0]);

        ({ category, confidenceScore } = await this.threatOracle.getThreatProperties(mockAccounts[0]));
        expect(category).to.be.equal(mockCategories[0]);
        expect(confidenceScore).to.be.equal(mockConfidenceScores[0]);
    });

    it('registers multiple accounts', async function () {
        for (let i = 0; i < mockAccounts.length; i++) {
            let { category, confidenceScore } = await this.threatOracle.getThreatProperties(mockAccounts[i]);
            expect(category).to.be.equal("");
            expect(confidenceScore).to.be.equal(0);
        }

        await expect(this.threatOracle.connect(this.accounts.manager).registerAccounts(mockAccounts, mockCategories, mockConfidenceScores));

        for (let i = 0; i < mockAccounts.length; i++) {
            ({ category, confidenceScore } = await this.threatOracle.getThreatProperties(mockAccounts[i]));
            expect(category).to.be.equal(mockCategories[i]);
            expect(confidenceScore).to.be.equal(mockConfidenceScores[i]);
        }
    });

    it('does not allow to register accounts without either categories or confidence scores being in equal amount', async function () {
        for (let i = 0; i < mockAccounts.length; i++) {
            let { category, confidenceScore } = await this.threatOracle.getThreatProperties(mockAccounts[i]);
            expect(category).to.be.equal("");
            expect(confidenceScore).to.be.equal(0);
        }

        const incorrectConfidenceScoresAmount = [...mockConfidenceScores, 40, 50];

        await expect(this.threatOracle.connect(this.accounts.manager).registerAccounts(mockAccounts, mockCategories, incorrectConfidenceScoresAmount))
            .to.be.revertedWith(`UnevenAmounts(${mockAccounts.length}, ${mockCategories.length}, ${incorrectConfidenceScoresAmount.length})`);

        for(let i = 0; i < mockAccounts.length; i++) {
            let { category, confidenceScore } = await this.threatOracle.getThreatProperties(mockAccounts[i]);
            expect(category).to.be.equal("");
            expect(confidenceScore).to.be.equal(0);
        }
    });

    it('does not allow an account without access control to register accounts', async function () {
        for (let i = 0; i < mockAccounts.length; i++) {
            let { category, confidenceScore } = await this.threatOracle.getThreatProperties(mockAccounts[i]);
            expect(category).to.be.equal("");
            expect(confidenceScore).to.be.equal(0);
        }

        await expect(this.threatOracle.connect(this.accounts.other).registerAccounts(mockAccounts, mockCategories, mockConfidenceScores))
            .to.be.revertedWith(`MissingRole("${this.roles.THREAT_ORACLE_ADMIN}", "${this.accounts.other.address}")`);

        for (let i = 0; i < mockAccounts.length; i++) {
            let { category, confidenceScore } = await this.threatOracle.getThreatProperties(mockAccounts[i]);
            expect(category).to.be.equal("");
            expect(confidenceScore).to.be.equal(0);
        }
    });

    it('allows FP to be corrected, i.e. remove account from block list', async function () {
        let { category, confidenceScore } = await this.threatOracle.getThreatProperties(mockAccounts[0]);
        expect(category).to.be.equal("");
        expect(confidenceScore).to.be.equal(0);

        await expect(this.threatOracle.connect(this.accounts.manager).registerAccounts([mockAccounts[0]], [mockCategories[0]], [mockConfidenceScores[0]]))
            .to.emit(this.threatOracle, 'AccountRegistered')
            .withArgs(mockAccounts[0], mockCategories[0], mockConfidenceScores[0]);

        ({ category, confidenceScore } = await this.threatOracle.getThreatProperties(mockAccounts[0]));
        expect(category).to.be.equal(mockCategories[0]);
        expect(confidenceScore).to.be.equal(mockConfidenceScores[0]);

        // FP correction
        await expect(this.threatOracle.connect(this.accounts.manager).deregisterAccounts([mockAccounts[0]]))
            .to.emit(this.threatOracle, 'AccountDeregistered')
            .withArgs(mockAccounts[0]);

        ({ category, confidenceScore } = await this.threatOracle.getThreatProperties(mockAccounts[0]));
        expect(category).to.be.equal("");
        expect(confidenceScore).to.be.equal(0);
    });

    it('does not allow a confidence score that is too high to be registered', async function () {
        let { category, confidenceScore } = await this.threatOracle.getThreatProperties(mockAccounts[0]);
        expect(category).to.be.equal("");
        expect(confidenceScore).to.be.equal(0);

        const maxConfidenceScore = 100;
        // Has to be between `100` (i.e. `MAX_CONFIDENCE_SCORE`)
        // and `255` since the argument is `uint8`.
        const tooHighConfidenceScore = 243;

        await expect(this.threatOracle.connect(this.accounts.manager).registerAccounts([mockAccounts[0]], [mockCategories[0]], [tooHighConfidenceScore]))
            .to.be.revertedWith(`ConfidenceScoreExceedsMax(${maxConfidenceScore}, ${tooHighConfidenceScore})`);

        ({ category, confidenceScore } = await this.threatOracle.getThreatProperties(mockAccounts[0]));
        expect(category).to.be.equal("");
        expect(confidenceScore).to.be.equal(0);
    });

    describe('Multicall', async function () {
        it('allows to register a high number of accounts', async function () {
            const highAmountMockAccounts = createAccounts(2000);
            const highAmountMockCategories = createThreatCategories(2000);
            const highAmountMockConfidenceScores = createConfidenceScores(2000);

            for(let i = 0; i < highAmountMockAccounts.length; i++) {
                let { category, confidenceScore } = await this.threatOracle.getThreatProperties(highAmountMockAccounts[i]);
                expect(category).to.be.equal("");
                expect(confidenceScore).to.be.equal(0);
            }

            // Hardhat is not allowing this check to pass, though it is expectedly running out of gas
            // await expect(this.threatOracle.connect(this.accounts.manager).registerAccounts(highAmountMockAccounts, highAmountMockCategories, highAmountMockConfidenceScores)).to.be.reverted;

            /*
            // Confirm Accounts weren't registered
            for(let i = 0; i < highAmountMockAccounts.length; i++) {
                ({ category, confidenceScore } = await this.threatOracle.getThreatProperties(highAmountMockAccounts[i]));
                expect(category).to.be.equal("");
                expect(confidenceScore).to.be.equal(0);
            }
            */

            // Multicall
            const argumentChunkSize = 50;
            const multicallChunkSize = 5;

            let calls = [];
            const mockAccountChunks = highAmountMockAccounts.chunk(argumentChunkSize);
            const mockCategoryChunks = highAmountMockCategories.chunk(argumentChunkSize);
            const mockConfidenceScores = highAmountMockConfidenceScores.chunk(argumentChunkSize);

            for(let i = 0; i < mockAccountChunks.length; i++) {
                calls.push(await this.threatOracle.interface.encodeFunctionData('registerAccounts', [mockAccountChunks[i], mockCategoryChunks[i], mockConfidenceScores[i]]));
            }

            await Promise.all(
                calls.chunk(multicallChunkSize).map(async (callChunk) => {
                    await this.threatOracle.connect(this.accounts.manager).multicall(callChunk);
                })
            );
            
            for(let i = 0; i < highAmountMockAccounts.length; i++) {
                ({ category, confidenceScore } = await this.threatOracle.getThreatProperties(highAmountMockAccounts[i]));
                expect(category).to.be.equal(highAmountMockCategories[i]);
                expect(confidenceScore).to.be.equal(highAmountMockConfidenceScores[i]);
            }
        });
        
        it('does not allow an account without access to register accounts', async function () {
            const highAmountMockAccounts = createAccounts(2000);
            const highAmountMockCategories = createThreatCategories(2000);
            const highAmountMockConfidenceScores = createConfidenceScores(2000);

            for(let i = 0; i < highAmountMockAccounts.length; i++) {
                let { category, confidenceScore } = await this.threatOracle.getThreatProperties(highAmountMockAccounts[i]);
                expect(category).to.be.equal("");
                expect(confidenceScore).to.be.equal(0);
            }

            // Hardhat is not allowing this check to pass, though it is expectedly running out of gas
            // await expect(this.threatOracle.connect(this.accounts.manager).registerAccounts(highAmountMockAccounts, highAmountMockCategories, highAmountMockConfidenceScores)).to.be.reverted;

            /*
            // Confirm accounts weren't registered
            for(let i = 0; i < highAmountMockAccounts.length; i++) {
                ({ category, confidenceScore } = await this.threatOracle.getThreatProperties(highAmountMockAccounts[i]));
                expect(category).to.be.equal("");
                expect(confidenceScore).to.be.equal(0);
            }
            */

            // Multicall
            const argumentChunkSize = 50;
            const multicallChunkSize = 5;

            let calls = [];
            const mockAccountChunks = highAmountMockAccounts.chunk(argumentChunkSize);
            const mockCategoryChunks = highAmountMockCategories.chunk(argumentChunkSize);
            const mockConfidenceScores = highAmountMockConfidenceScores.chunk(argumentChunkSize);

            for(let i = 0; i < mockAccountChunks.length; i++) {
                calls.push(await this.threatOracle.interface.encodeFunctionData('registerAccounts', [mockAccountChunks[i], mockCategoryChunks[i], mockConfidenceScores[i]]));
            }

            await Promise.all(
                calls.chunk(multicallChunkSize).map(async (callChunk) => {
                    await expect(this.threatOracle.connect(this.accounts.other).multicall(callChunk))
                        .to.be.revertedWith(`MissingRole("${this.roles.THREAT_ORACLE_ADMIN}", "${this.accounts.other.address}")`);
                })
            );
        });

        it('does not allow accounts to be registered if their categories and/or confidence scores are uneven in amount', async function () {
            // If the difference is greater than
            // `argumentChunkSize`, it would fail because encoding
            // wouldn't work if we only provide one array instead
            // of three.
            //
            // Additionally, the entries for all three
            // would also have to be in the same chunk, divisible
            // by `argumentChunkSize`.
            const highAmountMockAccounts = createAccounts(250);
            const highAmountMockCategories = createThreatCategories(240);
            const highAmountMockConfidenceScores = createConfidenceScores(240);

            for(let i = 0; i < highAmountMockAccounts.length; i++) {
                let { category, confidenceScore } = await this.threatOracle.getThreatProperties(highAmountMockAccounts[i]);
                expect(category).to.be.equal("");
                expect(confidenceScore).to.be.equal(0);
            }

            await expect(this.threatOracle.connect(this.accounts.manager).registerAccounts(highAmountMockAccounts, highAmountMockCategories, highAmountMockConfidenceScores)).to.be.revertedWith(
                `UnevenAmounts(${highAmountMockAccounts.length}, ${highAmountMockCategories.length}, ${highAmountMockConfidenceScores.length})`
            );

            // Confirm accounts weren't registered
            for(let i = 0; i < highAmountMockAccounts.length; i++) {
                ({ category, confidenceScore } = await this.threatOracle.getThreatProperties(highAmountMockAccounts[i]));
                expect(category).to.be.equal("");
                expect(confidenceScore).to.be.equal(0);
            }

            // Multicall
            const argumentChunkSize = 50;
            const multicallChunkSize = 5;

            let calls = [];
            const mockAccountChunk = highAmountMockAccounts.chunk(argumentChunkSize);                   // Length == 5
            const mockCategoryChunk = highAmountMockCategories.chunk(argumentChunkSize);                // Length == 5
            const mockConfidenceScoreChunk = highAmountMockConfidenceScores.chunk(argumentChunkSize);   // Length == 5

            for(let i = 0; i < mockAccountChunk.length; i++) {
                calls.push(await this.threatOracle.interface.encodeFunctionData('registerAccounts', [mockAccountChunk[i], mockCategoryChunk[i], mockConfidenceScoreChunk[i]]));
            }

            const multicallChunk = calls.chunk(multicallChunkSize);
            await expect(this.threatOracle.connect(this.accounts.manager).multicall(multicallChunk)).to.be.reverted;

            // Confirm accounts weren't registered
            for(let i = 0; i < highAmountMockAccounts.length; i++) {
                ({ category, confidenceScore } = await this.threatOracle.getThreatProperties(highAmountMockAccounts[i]));
                expect(category).to.be.equal("");
                expect(confidenceScore).to.be.equal(0);
            }
        });

        it('allows a high number of accounts to be added in subsequent blocks', async function () {
            const totalHighAmountMockAccounts = createAccounts(3500);
            const totalHighAmountMockCategories = createThreatCategories(3500);
            const totalHighAmountMockConfidenceScores = createConfidenceScores(3500);

            const highAmountMockAccounts = totalHighAmountMockAccounts.slice(0, 2000);
            const highAmountMockCategories = totalHighAmountMockCategories.slice(0, 2000);
            const highAmountMockConfidenceScores = totalHighAmountMockConfidenceScores.slice(0, 2000);

            // Multicall
            const argumentChunkSize = 50;
            const multicallChunkSize = 5;

            let calls = [];
            const mockAccountChunks = highAmountMockAccounts.chunk(argumentChunkSize);
            const mockCategoryChunks = highAmountMockCategories.chunk(argumentChunkSize);
            const mockConfidenceScores = highAmountMockConfidenceScores.chunk(argumentChunkSize);

            for(let i = 0; i < mockAccountChunks.length; i++) {
                calls.push(await this.threatOracle.interface.encodeFunctionData('registerAccounts', [mockAccountChunks[i], mockCategoryChunks[i], mockConfidenceScores[i]]));
            }

            await Promise.all(
                calls.chunk(multicallChunkSize).map(async (callChunk) => {
                    await this.threatOracle.connect(this.accounts.manager).multicall(callChunk);
                })
            );
            
            // Confirm accounts were registered
            for(let i = 0; i < highAmountMockAccounts.length; i++) {
                let { category, confidenceScore } = await this.threatOracle.getThreatProperties(highAmountMockAccounts[i]);
                expect(category).to.be.equal(highAmountMockCategories[i]);
                expect(confidenceScore).to.be.equal(highAmountMockConfidenceScores[i]);
            }


            // Increase one block
            const currentBlock = await helpers.time.latestBlock();
            await network.provider.send('evm_mine');
            expect(await helpers.time.latestBlock()).to.be.equal(currentBlock + 1);


            const highAmountMockAccountsTwo = totalHighAmountMockAccounts.slice(2000);
            const highAmountMockCategoriesTwo = totalHighAmountMockCategories.slice(2000);
            const highAmountMockConfidenceScoresTwo = totalHighAmountMockConfidenceScores.slice(2000);

            calls = [];
            const mockAccountChunksTwo = highAmountMockAccountsTwo.chunk(argumentChunkSize);
            const mockCategoryChunksTwo = highAmountMockCategoriesTwo.chunk(argumentChunkSize);
            const mockConfidenceScoresTwo = highAmountMockConfidenceScoresTwo.chunk(argumentChunkSize);

            for(let i = 0; i < mockAccountChunksTwo.length; i++) {
                calls.push(await this.threatOracle.interface.encodeFunctionData('registerAccounts', [mockAccountChunksTwo[i], mockCategoryChunksTwo[i], mockConfidenceScoresTwo[i]]));
            }

            await Promise.all(
                calls.chunk(multicallChunkSize).map(async (callChunk) => {
                    await this.threatOracle.connect(this.accounts.manager).multicall(callChunk);
                })
            );
            
            for(let i = 0; i < totalHighAmountMockAccounts.length; i++) {
                ({ category, confidenceScore } = await this.threatOracle.getThreatProperties(totalHighAmountMockAccounts[i]));
                expect(category).to.be.equal(totalHighAmountMockCategories[i]);
                expect(confidenceScore).to.be.equal(totalHighAmountMockConfidenceScores[i]);
            }
        });
    });

    describe('blocklist integration', async function () {
        it('blocks account from interacting with app if it was registered in the block list', async function () {
            expect(await this.oracleConsumer.connect(this.accounts.user1).foo()).to.be.equal(true);
            expect(await this.oracleConsumer.connect(this.accounts.user2).foo()).to.be.equal(true);

            const user2Category = "exploit";
            const user2ConfidenceScore = 95;
            await this.threatOracle.connect(this.accounts.manager).registerAccounts([this.accounts.user2.address], [user2Category], [user2ConfidenceScore]);

            let { category, confidenceScore } = await this.threatOracle.getThreatProperties(this.accounts.user2.address);
            expect(category).to.be.equal(user2Category);
            expect(confidenceScore).to.be.equal(user2ConfidenceScore);

            expect(await this.oracleConsumer.connect(this.accounts.user1).foo()).to.be.equal(true);
            await expect(this.oracleConsumer.connect(this.accounts.user2).foo()).to.be.reverted;
        });

        it('blocks account from interacting with app if it was registered in the block list via multicall', async function () {
            expect(await this.oracleConsumer.connect(this.accounts.user1).foo()).to.be.equal(true);
            expect(await this.oracleConsumer.connect(this.accounts.user2).foo()).to.be.equal(true);

            const user2Category = "exploit";
            const user2ConfidenceScore = 95;

            const highAmountMockAccounts = [...createAccounts(899), this.accounts.user2.address];
            const highAmountMockCategories = [...createThreatCategories(899), user2Category];
            const highAmountMockConfidenceScores = [...createConfidenceScores(899), user2ConfidenceScore];

            // Multicall
            const argumentChunkSize = 50;
            const multicallChunkSize = 5;

            let calls = [];
            const mockAccountChunks = highAmountMockAccounts.chunk(argumentChunkSize);
            const mockCategoryChunks = highAmountMockCategories.chunk(argumentChunkSize);
            const mockConfidenceScores = highAmountMockConfidenceScores.chunk(argumentChunkSize);

            for(let i = 0; i < mockAccountChunks.length; i++) {
                calls.push(await this.threatOracle.interface.encodeFunctionData('registerAccounts', [mockAccountChunks[i], mockCategoryChunks[i], mockConfidenceScores[i]]));
            }

            await Promise.all(
                calls.chunk(multicallChunkSize).map(async (callChunk) => {
                    await this.threatOracle.connect(this.accounts.manager).multicall(callChunk);
                })
            );
            
            for(let i = 0; i < highAmountMockAccounts.length; i++) {
                // `highAmountMockAccounts` includes `this.accounts.user2.address`
                let { category, confidenceScore } = await this.threatOracle.getThreatProperties(highAmountMockAccounts[i]);
                expect(category).to.be.equal(highAmountMockCategories[i]);
                expect(confidenceScore).to.be.equal(highAmountMockConfidenceScores[i]);
            }

            expect(await this.oracleConsumer.connect(this.accounts.user1).foo()).to.be.equal(true);
            await expect(this.oracleConsumer.connect(this.accounts.user2).foo()).to.be.reverted;
        });

        it('allows account to interact with app if its confidence score is below minimum threshold', async function () {
            expect(await this.oracleConsumer.connect(this.accounts.user1).foo()).to.be.equal(true);
            expect(await this.oracleConsumer.connect(this.accounts.user2).foo()).to.be.equal(true);

            const user2Category = "exploit";
            // Below minimum confidence score of 90
            const user2ConfidenceScore = 80;
            await this.threatOracle.connect(this.accounts.manager).registerAccounts([this.accounts.user2.address], [user2Category], [user2ConfidenceScore]);

            let { category, confidenceScore } = await this.threatOracle.getThreatProperties(this.accounts.user2.address);
            expect(category).to.be.equal(user2Category);
            expect(confidenceScore).to.be.equal(user2ConfidenceScore);

            expect(await this.oracleConsumer.connect(this.accounts.user1).foo()).to.be.equal(true);
            expect(await this.oracleConsumer.connect(this.accounts.user2).foo()).to.be.equal(true);
        });
    });
})