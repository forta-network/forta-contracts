const { ethers, upgrades, network } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');
const { subjectToActive, subjectToInactive } = require('../../scripts/utils/staking.js');

const SUBJECT_1_ADDRESS = '0x727E5FCcb9e2367555373e90E637500BCa5Da40c';
const subjects = [
    [ethers.BigNumber.from(SUBJECT_1_ADDRESS), 0], // Scanner id, scanner type
    [ethers.BigNumber.from(ethers.utils.id('135a782d-c263-43bd-b70b-920873ed7e9d')), 1], // Agent id, agent type
];
const [[subject1, subjectType1, active1, inactive1], [subject2, subjectType2, active2, inactive2]] = subjects.map((items) => [
    items[0],
    items[1],
    subjectToActive(items[1], items[0]),
    subjectToInactive(items[1], items[0]),
]);


const MAX_STAKE = '10000';

describe('Slashing Proposals', function () {
    prepare({ stake: { min: '1', max: MAX_STAKE, activated: true } });

    beforeEach(async function () {
        await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.user1.address);
        await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.user2.address);
        await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.user3.address);
        await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.minter.address);

        await this.token.connect(this.accounts.minter).mint(this.accounts.user1.address, ethers.utils.parseEther('10000'));
        await this.token.connect(this.accounts.minter).mint(this.accounts.user2.address, ethers.utils.parseEther('10000'));
        await this.token.connect(this.accounts.minter).mint(this.accounts.user3.address, ethers.utils.parseEther('10000'));

        await this.token.connect(this.accounts.user1).approve(this.slashing.address, ethers.constants.MaxUint256);
        await this.token.connect(this.accounts.user2).approve(this.slashing.address, ethers.constants.MaxUint256);
        await this.token.connect(this.accounts.user3).approve(this.slashing.address, ethers.constants.MaxUint256);

        await this.scanners.connect(this.accounts.manager).adminRegister(SUBJECT_1_ADDRESS, this.accounts.user1.address, 1, 'metadata');
    });

    describe('Proposal Lifecycle', function () {
        it('From proposal to slashing', async function () {
            
        });
    });
});
