const { ethers, upgrades, network } = require('hardhat');
const { parseEther } = ethers.utils;
const { expect } = require('chai');
const { prepare } = require('../fixture');
const { BigNumber } = require('ethers');

const SUBJECT_1_ADDRESS = '0x727E5FCcb9e2367555373e90E637500BCa5Da40c';
const subjects = [
    { id: ethers.BigNumber.from(SUBJECT_1_ADDRESS), type: 0 }, // Scanner id, scanner type
    { id: ethers.BigNumber.from(ethers.utils.id('135a782d-c263-43bd-b70b-920873ed7e9d')), type: 1 }, // Agent id, agent type
];

const MAX_STAKE = parseEther('10000');
const MIN_STAKE = parseEther('100');
const STAKING_DEPOSIT = parseEther('1000');

let slashTreasuryAddress, proposerPercent;

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

const EVIDENCE_FOR_STATE = (state) => {
    switch (state) {
        case STATES.CREATED:
            return ['CREATED evidence', '2'];
        case STATES.REJECTED:
            return ['REJECTED evidence', '2'];
        case STATES.DISMISSED:
            return ['DISMISSED evidence', '2'];
        case STATES.REVIEWED:
            return ['REVIEWED evidence', '2'];
        case STATES.REVERTED:
            return ['REVERTED evidence', '2'];
        default:
            throw new Error(`No need of evidence for ${state.toString()}`);
    }
};

describe('Slashing Proposals', function () {
    prepare({ stake: { min: MIN_STAKE, max: MAX_STAKE, activated: true } });

    beforeEach(async function () {
        await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.user1.address);
        await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.user2.address);
        await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.user3.address);
        await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.minter.address);

        await this.access.connect(this.accounts.admin).grantRole(this.roles.SLASHING_ARBITER, this.accounts.user3.address);
        await this.access.connect(this.accounts.admin).grantRole(this.roles.SLASHER, this.accounts.admin.address);

        await this.token.connect(this.accounts.minter).mint(this.accounts.user1.address, parseEther('100000'));
        await this.token.connect(this.accounts.minter).mint(this.accounts.user2.address, parseEther('100000'));
        await this.token.connect(this.accounts.minter).mint(this.accounts.user3.address, parseEther('100000'));

        await this.token.connect(this.accounts.user1).approve(this.slashing.address, ethers.constants.MaxUint256);
        await this.token.connect(this.accounts.user2).approve(this.slashing.address, ethers.constants.MaxUint256);
        await this.token.connect(this.accounts.user3).approve(this.slashing.address, ethers.constants.MaxUint256);

        await this.token.connect(this.accounts.user1).approve(this.staking.address, ethers.constants.MaxUint256);
        await this.token.connect(this.accounts.user2).approve(this.staking.address, ethers.constants.MaxUint256);
        await this.token.connect(this.accounts.user3).approve(this.staking.address, ethers.constants.MaxUint256);

        await this.scanners.connect(this.accounts.manager).adminRegister(SUBJECT_1_ADDRESS, this.accounts.user2.address, 1, 'metadata');
        await this.staking.connect(this.accounts.user2).deposit(0, SUBJECT_1_ADDRESS, STAKING_DEPOSIT);

        slashTreasuryAddress = await this.staking.treasury();
        proposerPercent = await this.slashing.slashPercentToProposer();
    });

    describe('Proposal Lifecycle', function () {
        it('From proposal to slashing', async function () {
            const PROPOSAL_ID = BigNumber.from('1');
            const initialDepositorBalance = await this.token.balanceOf(this.accounts.user2.address);
            const initialTreasuryBalance = await this.token.balanceOf(slashTreasuryAddress);

            await expect(
                this.slashing
                    .connect(this.accounts.user2)
                    .proposeSlash(subjects[0].type, subjects[0].id, this.slashParams.reasons.OPERATIONAL_SLASH, EVIDENCE_FOR_STATE(STATES.CREATED))
            )
                .to.emit(this.slashing, 'SlashProposalUpdated')
                .withArgs(this.accounts.user2.address, PROPOSAL_ID, this.accounts.user2.address, subjects[0].id, subjects[0].type, STAKING_DEPOSIT)
                .to.emit(this.slashing, 'EvidenceSubmitted')
                .withArgs(EVIDENCE_FOR_STATE(STATES.CREATED))
                .to.emit(this.slashing, 'MachineCreated')
                .withArgs(PROPOSAL_ID, STATES.CREATED)
                .to.emit(this.slashing, 'StateTransition')
                .withArgs(PROPOSAL_ID, STATES.UNDEFINED, STATES.CREATED)
                .to.emit(this.token, 'Transfer')
                .withArgs(this.accounts.user2.address, this.slashing.address, STAKING_DEPOSIT)
                .to.emit(this.staking, 'Froze')
                .withArgs(subjects[0].type, subjects[0].id, this.slashing.address, true);

            expect(await this.staking.isFrozen(subjects[0].type, subjects[0].id)).to.eq(true);
            expect(await this.token.balanceOf(this.accounts.user2.address)).to.eq(initialDepositorBalance.sub(STAKING_DEPOSIT));
            expect(await this.token.balanceOf(this.slashing.address)).to.eq(STAKING_DEPOSIT);
            expect(await this.slashing.currentState(PROPOSAL_ID)).to.eq(STATES.CREATED);

            await expect(this.slashing.connect(this.accounts.user3).markAsInReviewSlashProposal(PROPOSAL_ID))
                .to.emit(this.slashing, 'StateTransition')
                .withArgs(PROPOSAL_ID, STATES.CREATED, STATES.IN_REVIEW)
                .to.emit(this.token, 'Transfer')
                .withArgs(this.slashing.address, this.accounts.user2.address, STAKING_DEPOSIT);

            expect(await this.token.balanceOf(this.accounts.user2.address)).to.eq(initialDepositorBalance);
            expect(await this.token.balanceOf(this.slashing.address)).to.eq(BigNumber.from('0'));
            expect(await this.slashing.currentState(PROPOSAL_ID)).to.eq(STATES.IN_REVIEW);

            await expect(this.slashing.connect(this.accounts.user3).markAsReviewedSlashProposal(PROPOSAL_ID))
                .to.emit(this.slashing, 'StateTransition')
                .withArgs(PROPOSAL_ID, STATES.IN_REVIEW, STATES.REVIEWED);

            expect(await this.slashing.currentState(PROPOSAL_ID)).to.eq(STATES.REVIEWED);

            const slashedAmount = parseEther('15');
            const proposerShare = slashedAmount.mul(proposerPercent).div('100');
            const treasuryShare = slashedAmount.sub(proposerShare);

            await expect(this.slashing.connect(this.accounts.admin).executeSlashProposal(PROPOSAL_ID))
                .to.emit(this.slashing, 'StateTransition')
                .withArgs(PROPOSAL_ID, STATES.REVIEWED, STATES.EXECUTED)
                .to.emit(this.staking, 'Froze')
                .withArgs(subjects[0].type, subjects[0].id, this.slashing.address, false)
                .to.emit(this.staking, 'Slashed')
                .withArgs(subjects[0].type, subjects[0].id, this.slashing.address, parseEther('15'))
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, slashTreasuryAddress, treasuryShare)
                .to.emit(this.token, 'Transfer')
                .withArgs(this.staking.address, this.accounts.user2.address, proposerShare);
            expect(await this.token.balanceOf(this.accounts.user2.address)).to.eq(initialDepositorBalance.add(proposerShare));
            expect(await this.token.balanceOf(slashTreasuryAddress)).to.eq(initialTreasuryBalance.add(treasuryShare));
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

    describe('Slashing amounts', function () {
        beforeEach(async function () {
            const slashReasons = [ethers.utils.id('MIN_STAKE'), ethers.utils.id('MAX_STAKE'), ethers.utils.id('CURRENT_STAKE')];
            const slashPenalties = [
                { mode: this.slashParams.penaltyModes.MIN_STAKE, percentSlashed: '10' },
                { mode: this.slashParams.penaltyModes.MAX_STAKE, percentSlashed: '20' },
                { mode: this.slashParams.penaltyModes.CURRENT_STAKE, percentSlashed: '30' },
            ];
            await this.slashing.connect(this.accounts.admin).setSlashPenalties(slashReasons, slashPenalties);
        });

        it('min stake', async function () {
            // All active stake
            await this.staking.connect(this.accounts.user2).deposit(subjects[1].type, subjects[1].id, STAKING_DEPOSIT);
            await this.slashing.connect(this.accounts.user2).proposeSlash(subjects[0].type, subjects[0].id, ethers.utils.id('MIN_STAKE'), EVIDENCE_FOR_STATE(STATES.CREATED));
            expect(await this.slashing.getSlashedStakeValue('1')).to.eq(MIN_STAKE.mul('10').div('100'));
            await this.slashing.connect(this.accounts.user3).dismissSlashProposal('1', EVIDENCE_FOR_STATE(STATES.DISMISSED));

            // Mix active and inactive stake
            await this.staking.connect(this.accounts.user2).initiateWithdrawal(subjects[1].type, subjects[1].id, STAKING_DEPOSIT.div(2));
            await this.slashing.connect(this.accounts.user2).proposeSlash(subjects[0].type, subjects[0].id, ethers.utils.id('MIN_STAKE'), EVIDENCE_FOR_STATE(STATES.CREATED));
            expect(await this.slashing.getSlashedStakeValue('2')).to.eq(MIN_STAKE.mul('10').div('100'));
            await this.slashing.connect(this.accounts.user3).dismissSlashProposal('2', EVIDENCE_FOR_STATE(STATES.DISMISSED));

            // All inactive stake
            await this.staking.connect(this.accounts.user2).initiateWithdrawal(subjects[1].type, subjects[1].id, STAKING_DEPOSIT.div(2));
            await this.slashing.connect(this.accounts.user2).proposeSlash(subjects[0].type, subjects[0].id, ethers.utils.id('MIN_STAKE'), EVIDENCE_FOR_STATE(STATES.CREATED));
            expect(await this.slashing.getSlashedStakeValue('3')).to.eq(MIN_STAKE.mul('10').div('100'));
        });

        it('max possible stake', async function () {
            const maxSlashableStakePercent = await this.stakingParameters.maxSlashableStakePercent();
            const totalStake = await this.stakingParameters.totalStakeFor(subjects[0].type, subjects[0].id);
            const maxSlashable = totalStake.mul(maxSlashableStakePercent).div('100');

            // All active stake
            await this.staking.connect(this.accounts.user2).deposit(subjects[1].type, subjects[1].id, MAX_STAKE);
            await this.slashing.connect(this.accounts.user2).proposeSlash(subjects[0].type, subjects[0].id, ethers.utils.id('MAX_STAKE'), EVIDENCE_FOR_STATE(STATES.CREATED));
            console.log(MAX_STAKE.mul('20').div('100'));
            expect(await this.slashing.getSlashedStakeValue('1')).to.eq(maxSlashable);
            await this.slashing.connect(this.accounts.user3).dismissSlashProposal('1', EVIDENCE_FOR_STATE(STATES.DISMISSED));

            // Mix active and inactive stake
            await this.staking.connect(this.accounts.user2).initiateWithdrawal(subjects[1].type, subjects[1].id, MAX_STAKE.div(2));
            await this.slashing.connect(this.accounts.user2).proposeSlash(subjects[0].type, subjects[0].id, ethers.utils.id('MAX_STAKE'), EVIDENCE_FOR_STATE(STATES.CREATED));
            expect(await this.slashing.getSlashedStakeValue('2')).to.eq(maxSlashable);
            await this.slashing.connect(this.accounts.user3).dismissSlashProposal('2', EVIDENCE_FOR_STATE(STATES.DISMISSED));

            // All inactive stake
            await this.staking.connect(this.accounts.user2).initiateWithdrawal(subjects[1].type, subjects[1].id, MAX_STAKE.div(2));
            await this.slashing.connect(this.accounts.user2).proposeSlash(subjects[0].type, subjects[0].id, ethers.utils.id('MAX_STAKE'), EVIDENCE_FOR_STATE(STATES.CREATED));
            expect(await this.slashing.getSlashedStakeValue('3')).to.eq(maxSlashable.toString());
        });

        it('current stake', async function () {
            // All active stake
            await this.staking.connect(this.accounts.user2).deposit(subjects[1].type, subjects[1].id, STAKING_DEPOSIT);
            await this.slashing.connect(this.accounts.user2).proposeSlash(subjects[0].type, subjects[0].id, ethers.utils.id('CURRENT_STAKE'), EVIDENCE_FOR_STATE(STATES.CREATED));
            expect(await this.slashing.getSlashedStakeValue('1')).to.eq(STAKING_DEPOSIT.mul('30').div('100'));
            await this.slashing.connect(this.accounts.user3).dismissSlashProposal('1', EVIDENCE_FOR_STATE(STATES.DISMISSED));

            // Mix active and inactive stake
            await this.staking.connect(this.accounts.user2).initiateWithdrawal(subjects[1].type, subjects[1].id, STAKING_DEPOSIT.div(2));
            await this.slashing.connect(this.accounts.user2).proposeSlash(subjects[0].type, subjects[0].id, ethers.utils.id('CURRENT_STAKE'), EVIDENCE_FOR_STATE(STATES.CREATED));
            expect(await this.slashing.getSlashedStakeValue('2')).to.eq(STAKING_DEPOSIT.mul('30').div('100'));
            await this.slashing.connect(this.accounts.user3).dismissSlashProposal('2', EVIDENCE_FOR_STATE(STATES.DISMISSED));

            // All inactive stake
            await this.staking.connect(this.accounts.user2).initiateWithdrawal(subjects[1].type, subjects[1].id, STAKING_DEPOSIT.div(2));
            await this.slashing.connect(this.accounts.user2).proposeSlash(subjects[0].type, subjects[0].id, ethers.utils.id('CURRENT_STAKE'), EVIDENCE_FOR_STATE(STATES.CREATED));
            expect(await this.slashing.getSlashedStakeValue('3')).to.eq(STAKING_DEPOSIT.mul('30').div('100'));
        });
    });

    describe('Parameter setting', function () {});
});
