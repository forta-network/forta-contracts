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

describe('Slashing Proposals', function () {
    prepare({ stake: { min: '1', max: MAX_STAKE, activated: true } });

    beforeEach(async function () {
        await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.user1.address);
        await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.user2.address);
        await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.user3.address);
        await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.minter.address);

        await this.access.connect(this.accounts.admin).grantRole(this.roles.SLASHING_ARBITER, this.accounts.user2.address);

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
            await expect(
                this.slashing.connect(this.accounts.user1).proposeSlash('EVIDENCE_IPFS_HASH', subjects[0].type, subjects[0].id, this.slashParams.reasons.OPERATIONAL_SLASH)
            )
                .to.emit(this.slashing, 'SlashProposalCreated')
                .withArgs(BigNumber.from('1'), this.accounts.user1.address, subjects[0].id, subjects[0].type, 'EVIDENCE_IPFS_HASH', STAKING_DEPOSIT)
                .to.emit(this.slashing, 'MachineCreated')
                .withArgs(BigNumber.from('1'), BigNumber.from('1'))
                .to.emit(this.slashing, 'StateTransition')
                .withArgs(BigNumber.from('1'), BigNumber.from('0'), BigNumber.from('1'))
                .to.emit(this.token, 'Transfer')
                .withArgs(this.accounts.user1.address, this.slashing.address, STAKING_DEPOSIT)
                .to.emit(this.staking, 'Froze')
                .withArgs(subjects[0].type, subjects[0].id, this.slashing.address, true);

            expect(await this.staking.isFrozen(subjects[0].type, subjects[0].id));

            await expect(this.slashing.connect(this.accounts.user2).markAsInReviewSlashProposal())

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

    describe('Parameter setting', function () {
    });
});
