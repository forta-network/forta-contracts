const { ethers, network } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const { prepare } = require('../fixture');

// Also passed to SubscriptionManager
// during deployment in platform.js
const individualLockPlanBotUnits = 300;
const teamLockPlanBotUnits = 500;

describe('Bot Execution - Subscription & Units', async function () {
    prepare({ stake: {} });

    describe('Cannot hold subscription to both plans simultaneously', async function () {
        it('Individual -> Team', async function () {
            const individualKeyPrice = await this.individualLock.keyPrice();
            const teamKeyPrice = await this.teamLock.keyPrice();
    
            const txnReceipt = await this.individualLock.connect(this.accounts.user1).purchase(
                [individualKeyPrice],
                [this.accounts.user1.address],
                [this.accounts.user1.address],
                [ethers.constants.AddressZero],
                [[]],
                { gasLimit: 21000000 }
            );
            const purchaseTxn = await txnReceipt.wait();
            const individualKeyId = ethers.BigNumber.from(purchaseTxn.logs[0].topics[3]);
    
            expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(1);
            expect(await this.teamLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.individualLock.ownerOf(individualKeyId)).to.be.equal(this.accounts.user1.address);
            expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
            expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
            expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
    
            await expect(this.teamLock.connect(this.accounts.user1).purchase(
                [teamKeyPrice],
                [this.accounts.user1.address],
                [this.accounts.user1.address],
                [ethers.constants.AddressZero],
                [[]],
                { gasLimit: 21000000 }
            )).to.be.revertedWith(
                `LimitOneValidSubscription("${this.individualLock.address}", "${this.accounts.user1.address}")`
            );
    
            const txnReceiptTwo = await this.individualLock.connect(this.accounts.user1).cancelAndRefund(individualKeyId);
            await txnReceiptTwo.wait();
    
            expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.teamLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
    
            const txnReceiptThree = await this.teamLock.connect(this.accounts.user1).purchase(
                [teamKeyPrice],
                [this.accounts.user1.address],
                [this.accounts.user1.address],
                [ethers.constants.AddressZero],
                [[]],
                { gasLimit: 21000000 }
            );
    
            const purchaseTxnThree = await txnReceiptThree.wait();
            const teamKeyId = ethers.BigNumber.from(purchaseTxnThree.logs[0].topics[3]);
    
            expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.teamLock.balanceOf(this.accounts.user1.address)).to.be.equal(1);
            expect(await this.teamLock.ownerOf(teamKeyId)).to.be.equal(this.accounts.user1.address);
            expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
            expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);
            expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);
        });

        it('Team -> Individual', async function () {
            const individualKeyPrice = await this.individualLock.keyPrice();
            const teamKeyPrice = await this.teamLock.keyPrice();
    
            const txnReceipt = await this.teamLock.connect(this.accounts.user1).purchase(
                [teamKeyPrice],
                [this.accounts.user1.address],
                [this.accounts.user1.address],
                [ethers.constants.AddressZero],
                [[]],
                { gasLimit: 21000000 }
            );
            const purchaseTxn = await txnReceipt.wait();
            const teamKeyId = ethers.BigNumber.from(purchaseTxn.logs[0].topics[3]);
    
            expect(await this.teamLock.balanceOf(this.accounts.user1.address)).to.be.equal(1);
            expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.teamLock.ownerOf(teamKeyId)).to.be.equal(this.accounts.user1.address);
            expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
            expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);
            expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);
    
            await expect(this.individualLock.connect(this.accounts.user1).purchase(
                [individualKeyPrice],
                [this.accounts.user1.address],
                [this.accounts.user1.address],
                [ethers.constants.AddressZero],
                [[]],
                { gasLimit: 21000000 }
            )).to.be.revertedWith(
                `LimitOneValidSubscription("${this.teamLock.address}", "${this.accounts.user1.address}")`
            );
    
            const txnReceiptTwo = await this.teamLock.connect(this.accounts.user1).cancelAndRefund(teamKeyId);
            await txnReceiptTwo.wait();
    
            expect(await this.teamLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.teamLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
    
            const txnReceiptThree = await this.individualLock.connect(this.accounts.user1).purchase(
                [individualKeyPrice],
                [this.accounts.user1.address],
                [this.accounts.user1.address],
                [ethers.constants.AddressZero],
                [[]],
                { gasLimit: 21000000 }
            );
    
            const purchaseTxnThree = await txnReceiptThree.wait();
            const individualKeyId = ethers.BigNumber.from(purchaseTxnThree.logs[0].topics[3]);
    
            expect(await this.teamLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(1);
            expect(await this.teamLock.ownerOf(individualKeyId)).to.be.equal(this.accounts.user1.address);
            expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
            expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
            expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
        });
    });

    describe('Key receipt updating bot units balance', async function () {
        it('Purchase and plan switch', async function () {
            const individualKeyPrice = await this.individualLock.keyPrice();
            const teamKeyPrice = await this.teamLock.keyPrice();

            expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
            expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
            expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.teamLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

            const txnReceipt = await this.individualLock.connect(this.accounts.user1).purchase(
                [individualKeyPrice],
                [this.accounts.user1.address],
                [this.accounts.user1.address],
                [ethers.constants.AddressZero],
                [[]],
                { gasLimit: 21000000 }
            );
            const purchaseTxn = await txnReceipt.wait();
            const individualKeyId = ethers.BigNumber.from(purchaseTxn.logs[0].topics[3]);

            expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(1);
            expect(await this.teamLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.individualLock.ownerOf(individualKeyId)).to.be.equal(this.accounts.user1.address);
            expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
            expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
            expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
            expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);

            const txnReceiptTwo = await this.individualLock.connect(this.accounts.user1).cancelAndRefund(individualKeyId);
            await txnReceiptTwo.wait();

            expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.teamLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
            expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
            expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
            expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);

            const txnReceiptThree = await this.teamLock.connect(this.accounts.user1).purchase(
                [teamKeyPrice],
                [this.accounts.user1.address],
                [this.accounts.user1.address],
                [ethers.constants.AddressZero],
                [[]],
                { gasLimit: 21000000 }
            );

            const purchaseTxnThree = await txnReceiptThree.wait();
            const teamKeyId = ethers.BigNumber.from(purchaseTxnThree.logs[0].topics[3]);

            expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.teamLock.balanceOf(this.accounts.user1.address)).to.be.equal(1);
            expect(await this.teamLock.ownerOf(teamKeyId)).to.be.equal(this.accounts.user1.address);
            expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
            expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
            expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);
            expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanBotUnits);
        });

        it('another account purchases a key for the recipient', async function () {
            const individualKeyPrice = await this.individualLock.keyPrice();

            expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
            expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

            const txnReceipt = await this.individualLock.connect(this.accounts.user2).purchase(
                [individualKeyPrice],
                [this.accounts.user1.address],
                [this.accounts.user1.address],
                [ethers.constants.AddressZero],
                [[]],
                { gasLimit: 21000000 }
            );
            const purchaseTxn = await txnReceipt.wait();
            const individualKeyId = ethers.BigNumber.from(purchaseTxn.logs[0].topics[3]);

            expect(await this.individualLock.balanceOf(this.accounts.user2.address)).to.be.equal(0);
            expect(await this.individualLock.getHasValidKey(this.accounts.user2.address)).to.be.equal(false);
            expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user2.address)).to.be.equal(0);
            expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user2.address)).to.be.equal(0);

            expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(1);
            expect(await this.individualLock.ownerOf(individualKeyId)).to.be.equal(this.accounts.user1.address);
            expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
            expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
            expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
        });

        describe('Granting of keys', async function () {
            it('Lock manager grants a key to the recipient', async function () {
                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                const latestTimestamp = await helpers.time.latest();
    
                const txnReceipt = await this.individualLock.connect(this.accounts.admin).grantKeys(
                    [this.accounts.user1.address],
                    [latestTimestamp + 604800],
                    [this.accounts.user1.address],
                    { gasLimit: 21000000 }
                );
                const purchaseTxn = await txnReceipt.wait();
                const individualKeyId = ethers.BigNumber.from(purchaseTxn.logs[0].topics[1]);
    
                expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(1);
                expect(await this.individualLock.ownerOf(individualKeyId)).to.be.equal(this.accounts.user1.address);
                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
            });

            it('Only Lock manager can grant keys', async function () {
                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

                const latestTimestamp = await helpers.time.latest();
    
                await expect(this.individualLock.connect(this.accounts.other).grantKeys(
                    [this.accounts.user1.address],
                    [latestTimestamp + 604800],
                    [this.accounts.user1.address],
                    { gasLimit: 21000000 }
                )).to.be.revertedWith('ONLY_LOCK_MANAGER_OR_KEY_GRANTER()');
            });
        });
    });

    describe.only('Transfer for subscription', async function () {
        it('Subscription owner unable to transfer', async function () {
            const individualKeyPrice = await this.individualLock.keyPrice();

            expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
            expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

            const txnReceipt = await this.individualLock.connect(this.accounts.user1).purchase(
                [individualKeyPrice],
                [this.accounts.user1.address],
                [this.accounts.user1.address],
                [ethers.constants.AddressZero],
                [[]],
                { gasLimit: 21000000 }
            );
            const purchaseTxn = await txnReceipt.wait();
            const individualKeyId = ethers.BigNumber.from(purchaseTxn.logs[0].topics[3]);

            expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(1);
            expect(await this.individualLock.ownerOf(individualKeyId)).to.be.equal(this.accounts.user1.address);
            expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
            expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
            expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
    
            await expect(this.individualLock.connect(this.accounts.user1).transferFrom(
                this.accounts.user1.address,
                this.accounts.other.address,
                individualKeyId,
                { gasLimit: 21000000 }
            )).to.be.revertedWith('KEY_TRANSFERS_DISABLED()');
        });

        it.only('Lock manager able to transfer keys', async function () {
            const individualKeyPrice = await this.individualLock.keyPrice();

            expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
            expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(0);

            const txnReceipt = await this.individualLock.connect(this.accounts.user1).purchase(
                [individualKeyPrice],
                [this.accounts.user1.address],
                [this.accounts.user1.address],
                [ethers.constants.AddressZero],
                [[]],
                { gasLimit: 21000000 }
            );
            const purchaseTxn = await txnReceipt.wait();
            const individualKeyId = ethers.BigNumber.from(purchaseTxn.logs[0].topics[3]);

            expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(1);
            expect(await this.individualLock.ownerOf(individualKeyId)).to.be.equal(this.accounts.user1.address);
            expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
            expect(await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);
            expect(await this.botUnits.getOwnerInactiveBotUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanBotUnits);

            const txnReceiptTwo = await this.individualLock.connect(this.accounts.admin).transferFrom(
                this.accounts.user1.address,
                this.accounts.user2.address,
                individualKeyId,
                { gasLimit: 21000000 }
            );
            await txnReceiptTwo.wait();

            // Extending user2's newly acquired key since the `transferFrom`
            // is setting the expiration timestamp to the current time stamp
            //
            // TODO: Figure out if this is supposed
            // to occur with the transfer of keys
            const txnReceiptThree = await this.individualLock.connect(this.accounts.user2).extend(
                individualKeyPrice,
                individualKeyId,
                this.accounts.user2.address,
                "0x",
                { gasLimit: 21000000 }
            );
            await txnReceiptThree.wait();

            expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);

            // TODO: Incorporate a transfer hook into the `SubscriptionManager` in the
            // cases where the Lock admin transfer the key from one account to another. 
            // The recipient should have a balance of bot units.
            console.log(`user1 bot units: ${await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user1.address)}`);
            console.log(`user2 bot units: ${await this.botUnits.getOwnerBotUnitsCapacity(this.accounts.user2.address)}`);

            expect(await this.individualLock.balanceOf(this.accounts.user2.address)).to.be.equal(1);
            expect(await this.individualLock.ownerOf(individualKeyId)).to.be.equal(this.accounts.user2.address);
            expect(await this.individualLock.getHasValidKey(this.accounts.user2.address)).to.be.equal(true);
        });
    });
})