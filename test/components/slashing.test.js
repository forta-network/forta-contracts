const { ethers, upgrades, network } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');
const { BigNumber } = require('ethers');

const SUBJECT_1_ADDRESS = '0x727E5FCcb9e2367555373e90E637500BCa5Da40c';
const subjects = [
    { id: ethers.BigNumber.from(SUBJECT_1_ADDRESS), type: 0 }, // Scanner id, scanner type
    { id: ethers.BigNumber.from(ethers.utils.id('135a782d-c263-43bd-b70b-920873ed7e9d')), type: 1 }, // Agent id, agent type
];

const MAX_STAKE = '10000';
const STAKING_DEPOSIT = ethers.utils.parseEther('1000');

const STATES = {
    UNDEFINED: BigNumber.from('0'),
    CREATED: BigNumber.from('1'),
    REJECTED: BigNumber.from('2'),
    DISMISSED: BigNumber.from('3'),
    IN_REVIEW: BigNumber.from('4'),
    REVIEWED: BigNumber.from('5'),
    EXECUTED: BigNumber.from('6'),
    REVERTED: BigNumber.from('7'),
};

describe('Slashing Proposals', function () {
    prepare({ stake: { min: '1', max: MAX_STAKE, activated: true } });

    beforeEach(async function () {
        await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.user1.address);
        await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.user2.address);
        await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.user3.address);
        await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.minter.address);

        await this.access.connect(this.accounts.admin).grantRole(this.roles.SLASHING_ARBITER, this.accounts.user2.address);
        await this.access.connect(this.accounts.admin).grantRole(this.roles.SLASHER, this.accounts.user3.address);

        await this.token.connect(this.accounts.minter).mint(this.accounts.user1.address, ethers.utils.parseEther('100000'));
        await this.token.connect(this.accounts.minter).mint(this.accounts.user2.address, ethers.utils.parseEther('100000'));
        await this.token.connect(this.accounts.minter).mint(this.accounts.user3.address, ethers.utils.parseEther('100000'));

        await this.token.connect(this.accounts.user1).approve(this.slashing.address, ethers.constants.MaxUint256);
        await this.token.connect(this.accounts.user2).approve(this.slashing.address, ethers.constants.MaxUint256);
        await this.token.connect(this.accounts.user3).approve(this.slashing.address, ethers.constants.MaxUint256);

        await this.scanners.connect(this.accounts.manager).adminRegister(SUBJECT_1_ADDRESS, this.accounts.user1.address, 1, 'metadata');
    });

    describe('Proposal Lifecycle', function () {
        it('From proposal to slashing', async function () {
            const PROPOSAL_ID = BigNumber.from('1');
            const initialDepositorBalance = await this.token.balanceOf(this.accounts.user1.address);
            await expect(
                this.slashing.connect(this.accounts.user1).proposeSlash('EVIDENCE_IPFS_HASH', subjects[0].type, subjects[0].id, this.slashParams.reasons.OPERATIONAL_SLASH)
            )
                .to.emit(this.slashing, 'SlashProposalCreated')
                .withArgs(PROPOSAL_ID, this.accounts.user1.address, subjects[0].id, subjects[0].type, 'EVIDENCE_IPFS_HASH', STAKING_DEPOSIT)
                .to.emit(this.slashing, 'MachineCreated')
                .withArgs(PROPOSAL_ID, STATES.CREATED)
                .to.emit(this.slashing, 'StateTransition')
                .withArgs(PROPOSAL_ID, STATES.UNDEFINED, STATES.CREATED)
                .to.emit(this.token, 'Transfer')
                .withArgs(this.accounts.user1.address, this.slashing.address, STAKING_DEPOSIT)
                .to.emit(this.staking, 'Froze')
                .withArgs(subjects[0].type, subjects[0].id, this.slashing.address, true);

            expect(await this.staking.isFrozen(subjects[0].type, subjects[0].id)).to.eq(true);
            expect(await this.token.balanceOf(this.accounts.user1.address)).to.eq(initialDepositorBalance.sub(STAKING_DEPOSIT));
            expect(await this.token.balanceOf(this.slashing.address)).to.eq(STAKING_DEPOSIT);
            expect(await this.slashing.currentState(PROPOSAL_ID)).to.eq(STATES.CREATED);

            await expect(this.slashing.connect(this.accounts.user2).markAsInReviewSlashProposal(PROPOSAL_ID))
                .to.emit(this.slashing, 'StateTransition')
                .withArgs(PROPOSAL_ID, STATES.CREATED, STATES.IN_REVIEW)
                .to.emit(this.token, 'Transfer')
                .withArgs(this.slashing.address, this.accounts.user1.address, STAKING_DEPOSIT);

            expect(await this.token.balanceOf(this.accounts.user1.address)).to.eq(initialDepositorBalance);
            expect(await this.token.balanceOf(this.slashing.address)).to.eq(BigNumber.from('0'));
            expect(await this.slashing.currentState(PROPOSAL_ID)).to.eq(STATES.IN_REVIEW);

            await expect(this.slashing.connect(this.accounts.user2).markAsReviewedSlashProposal(PROPOSAL_ID))
                .to.emit(this.slashing, 'StateTransition')
                .withArgs(PROPOSAL_ID, STATES.IN_REVIEW, STATES.REVIEWED);

            expect(await this.slashing.currentState(PROPOSAL_ID)).to.eq(STATES.REVIEWED);
            
            await expect(this.slashing.connect(this.accounts.user3).executeSlashProposal(PROPOSAL_ID))
                .to.emit(this.slashing, 'StateTransition')
                .withArgs(PROPOSAL_ID, STATES.REVIEWED, STATES.EXECUTED)
                .to.emit(this.staking, 'Froze')
                .withArgs(subjects[0].type, subjects[0].id, this.slashing.address, false);

            expect(await this.staking.isFrozen(subjects[0].type, subjects[0].id)).to.eq(false);

        });

        it.skip('should not propose if proposer does not have deposit');
        it.skip('should not propose if proposal already exists');
        it.skip('should not propose if proposal has invalid reason');
        it.skip('should not propose if proposal has empty evidence');
        it.skip('should not propose if proposal has invalid subject type');
        it.skip('should not propose if proposal if subject is not registered');

        it.skip('should not move from CREATED if not authorized');
        it.skip('should not move from CREATED to wrong states');
        //DISMISSED, REJECTED or IN_REVIEW
        it.skip('should not move from DISMISSED to wrong states');
        it.skip('should not move from REJECTED to wrong states');
        it.skip('should not move from IN_REVIEW to wrong states');

        it.skip('should not move from IN_REVIEW if not authorized');

        // IN_REVIEW --> REVIEWED or REVERTED
        it.skip('should not move from REVIEWED if not authorized');
        it.skip('should not move from REVIEWED to wrong states');
        it.skip('should not move from REVERTED to wrong states');
        it.skip('should not move from EXECUTED to wrong states');
        // REVIEWED --> EXECUTED or REVERTED
    });

    describe('Parameter setting', function () {});
});
