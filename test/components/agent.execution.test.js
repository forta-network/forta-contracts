const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const { prepare } = require('../fixture');

// Also passed to SubscriptionManager
// during deployment in platform.js
const individualLockPlanAgentUnits = 300;
const teamLockPlanAgentUnits = 500;

const AGENT_ID = ethers.utils.hexlify(ethers.utils.randomBytes(32));
const redundancy = 6;
const shards = 10;

describe('Agent Execution - Subscription & Units', async function () {
    prepare({ stake: { agents: { min: '100', max: '500', activated: true } } });

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
            expect(await this.agentUnits.getOwnerAgentUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanAgentUnits);
            expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanAgentUnits);
    
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
            expect(await this.agentUnits.getOwnerAgentUnitsCapacity(this.accounts.user1.address)).to.be.equal(teamLockPlanAgentUnits);
            expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanAgentUnits);
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
            expect(await this.agentUnits.getOwnerAgentUnitsCapacity(this.accounts.user1.address)).to.be.equal(teamLockPlanAgentUnits);
            expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanAgentUnits);
    
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
            expect(await this.agentUnits.getOwnerAgentUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanAgentUnits);
            expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanAgentUnits);
        });
    });

    describe('Key receipt updating agent units balance', async function () {
        it('Purchase and plan switch', async function () {
            const individualKeyPrice = await this.individualLock.keyPrice();
            const teamKeyPrice = await this.teamLock.keyPrice();

            expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
            expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
            expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.teamLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.agentUnits.getOwnerAgentUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user1.address)).to.be.equal(0);

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
            expect(await this.agentUnits.getOwnerAgentUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanAgentUnits);
            expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanAgentUnits);

            const txnReceiptTwo = await this.individualLock.connect(this.accounts.user1).cancelAndRefund(individualKeyId);
            await txnReceiptTwo.wait();

            expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.teamLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
            expect(await this.teamLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
            expect(await this.agentUnits.getOwnerAgentUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanAgentUnits);
            expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanAgentUnits);

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
            expect(await this.agentUnits.getOwnerAgentUnitsCapacity(this.accounts.user1.address)).to.be.equal(teamLockPlanAgentUnits);
            expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user1.address)).to.be.equal(teamLockPlanAgentUnits);
        });

        it('another account purchases a key for the recipient', async function () {
            const individualKeyPrice = await this.individualLock.keyPrice();

            expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
            expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.agentUnits.getOwnerAgentUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user1.address)).to.be.equal(0);

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
            expect(await this.agentUnits.getOwnerAgentUnitsCapacity(this.accounts.user2.address)).to.be.equal(0);
            expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user2.address)).to.be.equal(0);

            expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(1);
            expect(await this.individualLock.ownerOf(individualKeyId)).to.be.equal(this.accounts.user1.address);
            expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(true);
            expect(await this.agentUnits.getOwnerAgentUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanAgentUnits);
            expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanAgentUnits);
        });

        describe('Granting of keys', async function () {
            it('Lock manager grants a key to the recipient', async function () {
                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.agentUnits.getOwnerAgentUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user1.address)).to.be.equal(0);

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
                expect(await this.agentUnits.getOwnerAgentUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanAgentUnits);
                expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanAgentUnits);
            });

            it('Only Lock manager can grant keys', async function () {
                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.agentUnits.getOwnerAgentUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user1.address)).to.be.equal(0);

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

    describe('Transfer of subscription', async function () {
        it('Subscription owner unable to transfer', async function () {
            const individualKeyPrice = await this.individualLock.keyPrice();

            expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
            expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.agentUnits.getOwnerAgentUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
            expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user1.address)).to.be.equal(0);

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
            expect(await this.agentUnits.getOwnerAgentUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanAgentUnits);
            expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanAgentUnits);
    
            await expect(this.individualLock.connect(this.accounts.user1).transferFrom(
                this.accounts.user1.address,
                this.accounts.other.address,
                individualKeyId,
                { gasLimit: 21000000 }
            )).to.be.revertedWith('KEY_TRANSFERS_DISABLED()');
        });

        describe('Key transfer by Lock manager', async function () {
            it('Lock manager able to transfer keys', async function () {
                const individualKeyPrice = await this.individualLock.keyPrice();
    
                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.agentUnits.getOwnerAgentUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.agentUnits.getOwnerActiveAgentUnits(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user1.address)).to.be.equal(0);
    
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
                expect(await this.agentUnits.getOwnerAgentUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanAgentUnits);
                expect(await this.agentUnits.getOwnerActiveAgentUnits(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanAgentUnits);
    
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
                expect(await this.agentUnits.getOwnerAgentUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user1.address)).to.be.equal(0);
    
                expect(await this.individualLock.balanceOf(this.accounts.user2.address)).to.be.equal(1);
                expect(await this.individualLock.ownerOf(individualKeyId)).to.be.equal(this.accounts.user2.address);
                expect(await this.individualLock.getHasValidKey(this.accounts.user2.address)).to.be.equal(true);
                expect(await this.agentUnits.getOwnerAgentUnitsCapacity(this.accounts.user2.address)).to.be.equal(individualLockPlanAgentUnits);
                expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user2.address)).to.be.equal(individualLockPlanAgentUnits);
            });

            it('agent owner must disable agent before Lock manager can transfer', async function () {
                const individualKeyPrice = await this.individualLock.keyPrice();
    
                expect(await this.individualLock.getHasValidKey(this.accounts.user1.address)).to.be.equal(false);
                expect(await this.individualLock.balanceOf(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.agentUnits.getOwnerAgentUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.agentUnits.getOwnerActiveAgentUnits(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user1.address)).to.be.equal(0);
    
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
                expect(await this.agentUnits.getOwnerAgentUnitsCapacity(this.accounts.user1.address)).to.be.equal(individualLockPlanAgentUnits);
                expect(await this.agentUnits.getOwnerActiveAgentUnits(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanAgentUnits);

                const args = [AGENT_ID, 'Metadata1', [1, 3, 4, 5], redundancy, shards];
                await expect(this.agents.connect(this.accounts.user1).registerAgent(...args))
                    .to.emit(this.agents, 'Transfer')
                    .withArgs(ethers.constants.AddressZero, this.accounts.user1.address, AGENT_ID)
                    .to.emit(this.agents, 'AgentUpdated')
                    .withArgs(AGENT_ID, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5], redundancy, shards);
                expect(await this.agentUnits.getOwnerActiveAgentUnits(this.accounts.user1.address)).to.be.equal([1, 3, 4, 5].length * redundancy * shards);
                expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanAgentUnits - ([1, 3, 4, 5].length * redundancy * shards));

                await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.AGENT, AGENT_ID, '100');
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(true);

                await expect(this.individualLock.connect(this.accounts.admin).transferFrom(
                    this.accounts.user1.address,
                    this.accounts.user2.address,
                    individualKeyId,
                    { gasLimit: 21000000 }
                )).to.be.revertedWith(`MustHaveNoActiveAgentUnits("${this.accounts.user1.address}")`);

                await expect(this.agents.connect(this.accounts.user1).disableAgent(AGENT_ID, 1)).to.emit(this.agents, 'AgentEnabled').withArgs(AGENT_ID, false, 1, false);

                expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user1.address)).to.be.equal(individualLockPlanAgentUnits);
                expect(await this.agentUnits.getOwnerActiveAgentUnits(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.agents.isEnabled(AGENT_ID)).to.be.equal(false);
                expect(await this.agents.getDisableFlags(AGENT_ID)).to.be.equal([2]);
    
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
                expect(await this.agentUnits.getOwnerAgentUnitsCapacity(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.agentUnits.getOwnerActiveAgentUnits(this.accounts.user1.address)).to.be.equal(0);
                expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user1.address)).to.be.equal(0);
    
                expect(await this.individualLock.balanceOf(this.accounts.user2.address)).to.be.equal(1);
                expect(await this.individualLock.ownerOf(individualKeyId)).to.be.equal(this.accounts.user2.address);
                expect(await this.individualLock.getHasValidKey(this.accounts.user2.address)).to.be.equal(true);
                expect(await this.agentUnits.getOwnerAgentUnitsCapacity(this.accounts.user2.address)).to.be.equal(individualLockPlanAgentUnits);
                expect(await this.agentUnits.getOwnerActiveAgentUnits(this.accounts.user2.address)).to.be.equal(0);
                expect(await this.agentUnits.getOwnerInactiveAgentUnits(this.accounts.user2.address)).to.be.equal(individualLockPlanAgentUnits);
            });
        });
    });

    describe('Access control', async function () {
        it('only SUBSCRIPTION_ADMIN_ROLE can call setSubscriptionPlan', async function () {
            await expect(this.subscriptionManager.connect(this.accounts.other).setSubscriptionPlan(this.individualLock.address, 600, 1))
                .to.be.revertedWith(`MissingRole("${this.roles.SUBSCRIPTION_ADMIN}", "${this.accounts.other.address}")`);

            await expect(this.subscriptionManager.connect(this.accounts.manager).setSubscriptionPlan(this.individualLock.address, 600, 1))
                .to.emit(this.subscriptionManager, 'SubscriptionPlanUpdated')
                .withArgs(this.individualLock.address, 600, 1);
        });

        it('only SUBSCRIPTION_ADMIN_ROLE can call setAgentUnits', async function () {
            await expect(this.subscriptionManager.connect(this.accounts.other).setAgentUnits(this.agentUnits.address))
                .to.be.revertedWith(`MissingRole("${this.roles.SUBSCRIPTION_ADMIN}", "${this.accounts.other.address}")`);

            await expect(this.subscriptionManager.connect(this.accounts.manager).setAgentUnits(this.agentUnits.address))
                .to.emit(this.subscriptionManager, 'AgentUnitsContractUpdated')
                .withArgs(this.agentUnits.address);
        });
    });
})