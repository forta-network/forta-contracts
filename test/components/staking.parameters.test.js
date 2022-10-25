const { ethers, network, upgrades } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');

const subjects = [
    ['1', 2], // node runner id, node runner type
    [ethers.BigNumber.from(ethers.utils.id('135a782d-c263-43bd-b70b-920873ed7e9d')), 1], // Agent id, agent type
    ['2', 2],
];

// eslint-disable-next-line no-unused-vars
const [[subject1, subjectType1], [subject2, subjectType2], [subject3, subjectType3]] = subjects.map((items) => [items[0], items[1], items[2]]);

const prepareCommit = (...args) => ethers.utils.solidityKeccak256(['bytes32', 'address', 'string', 'uint256[]'], args);

describe('Forta Staking Parameters', function () {
    prepare();

    beforeEach(async function () {
        await this.token.connect(this.accounts.minter).mint(this.accounts.user1.address, ethers.utils.parseEther('1000'));
        await this.token.connect(this.accounts.user1).approve(this.staking.address, ethers.constants.MaxUint256);
    });

    describe('Node Runners', function () {
        beforeEach(async function () {
            await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner(1);
            await this.nodeRunners.connect(this.accounts.user1).registerNodeRunner(2);

            //await this.scanners.connect(this.accounts.manager).adminRegister(ethers.utils.hexValue(subject1), this.accounts.user1.address, 1, 'metadata');
            //await this.scanners.connect(this.accounts.manager).adminRegister(subject3Address, this.accounts.user1.address, 2, 'metadata');
        });
        it('happy path', async function () {
            expect(await this.stakingParameters.minStakeFor(subjectType1, subject1)).to.equal(0);
            expect(await this.nodeRunners.isStakedOverMin(subject1)).to.equal(true);

            await expect(this.nodeRunners.connect(this.accounts.manager).setStakeThreshold({ max: '500', min: '100', activated: true }))
                .to.emit(this.nodeRunners, 'StakeThresholdChanged')
                .withArgs('100', '500', true);
            expect(await this.stakingParameters.minStakeFor(subjectType1, subject1)).to.equal(100);
            expect(await this.stakingParameters.maxStakeFor(subjectType1, subject1)).to.equal(500);

            expect(await this.nodeRunners.isStakedOverMin(subject1)).to.equal(false);
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '101')).to.not.be.reverted;
            expect(await this.nodeRunners.isStakedOverMin(subject1)).to.equal(true);
        });

        it('changing general minimum stake reflects on previous staked values', async function () {
            await this.nodeRunners.connect(this.accounts.manager).setStakeThreshold({ max: '500', min: '100', activated: true });
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '101')).to.not.be.reverted;
            await this.nodeRunners.connect(this.accounts.manager).setStakeThreshold({ max: '500', min: '200', activated: true });
            expect(await this.nodeRunners.isStakedOverMin(subject1)).to.equal(false);
            await this.nodeRunners.connect(this.accounts.manager).setStakeThreshold({ max: '500', min: '10', activated: true });
            expect(await this.nodeRunners.isStakedOverMin(subject1)).to.equal(true);
        });

        it('cannot stake on unknown scanner', async function () {
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, ethers.BigNumber.from(ethers.Wallet.createRandom().address), '101')).to.be.revertedWith(
                'StakeInactiveOrSubjectNotFound()'
            );
        });

        it('cannot stake without max cap set', async function () {
            const args = [subject2, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5]];
            await this.agents.connect(this.accounts.other).createAgent(...args);
            await this.agents.connect(this.accounts.manager).setStakeThreshold({ max: '500', min: '100', activated: false });

            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType2, subject2, '101')).to.be.revertedWith('StakeInactiveOrSubjectNotFound()');
        });

        it('cannot set unauthorized', async function () {
            await expect(this.nodeRunners.connect(this.accounts.user1).setStakeThreshold({ max: '500', min: '100', activated: true })).to.be.revertedWith(
                `MissingRole("${this.roles.NODE_RUNNER_ADMIN}", "${this.accounts.user1.address}")`
            );
        });

        it('cannot set min > max', async function () {
            await expect(this.nodeRunners.connect(this.accounts.manager).setStakeThreshold({ max: '50', min: '100', activated: true })).to.be.revertedWith(
                `StakeThresholdMaxLessOrEqualMin()`
            );
        });
    });

    describe('Agents', function () {
        const AGENT_ID_1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
        const AGENT_ID_2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

        beforeEach(async function () {
            const args1 = [AGENT_ID_1, this.accounts.user1.address, 'Metadata1', [1, 3, 4, 5]];
            await this.agents.prepareAgent(prepareCommit(...args1));
            await network.provider.send('evm_increaseTime', [300]);
            await this.agents.connect(this.accounts.other).createAgent(...args1);
            const args2 = [AGENT_ID_2, this.accounts.user1.address, 'Metadata2', [1, 3, 4, 500]];
            await this.agents.prepareAgent(prepareCommit(...args2));
            await network.provider.send('evm_increaseTime', [300]);
            await this.agents.connect(this.accounts.other).createAgent(...args2);
        });
        it('happy path', async function () {
            expect(await this.stakingParameters.minStakeFor(subjectType2, AGENT_ID_1)).to.equal(0);
            expect(await this.agents.isStakedOverMin(AGENT_ID_1)).to.equal(true);

            await expect(this.agents.connect(this.accounts.manager).setStakeThreshold({ max: '500', min: '100', activated: true }))
                .to.emit(this.agents, 'StakeThresholdChanged')
                .withArgs('100', '500', true);
            expect(await this.stakingParameters.minStakeFor(subjectType2, AGENT_ID_1)).to.equal(100);
            expect(await this.stakingParameters.maxStakeFor(subjectType2, AGENT_ID_1)).to.equal(500);

            expect(await this.agents.isStakedOverMin(AGENT_ID_1)).to.equal(false);
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType2, AGENT_ID_1, '101')).to.not.be.reverted;
            expect(await this.agents.isStakedOverMin(AGENT_ID_1)).to.equal(true);
        });

        it('changing general minimum stake reflects on previous staked values', async function () {
            await this.agents.connect(this.accounts.manager).setStakeThreshold({ max: '500', min: '100', activated: true });
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType2, AGENT_ID_1, '101')).to.not.be.reverted;

            await this.agents.connect(this.accounts.manager).setStakeThreshold({ max: '500', min: '200', activated: true });

            expect(await this.agents.isStakedOverMin(AGENT_ID_1)).to.equal(false);

            await this.agents.connect(this.accounts.manager).setStakeThreshold({ max: '500', min: '10', activated: true });

            expect(await this.agents.isStakedOverMin(AGENT_ID_1)).to.equal(true);
        });

        it('same stake min for all agents', async function () {
            await this.agents.connect(this.accounts.manager).setStakeThreshold({ max: '500', min: '100', activated: true });
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType2, AGENT_ID_1, '101')).to.not.be.reverted;
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType2, AGENT_ID_2, '200')).to.not.be.reverted;
            expect(await this.agents.connect(this.accounts.user1).isStakedOverMin(AGENT_ID_1)).to.equal(true);
            expect(await this.agents.connect(this.accounts.user1).isStakedOverMin(AGENT_ID_2)).to.equal(true);
            await this.agents.connect(this.accounts.manager).setStakeThreshold({ max: '500', min: '300', activated: true });
            expect(await this.agents.connect(this.accounts.user1).isStakedOverMin(AGENT_ID_1)).to.equal(false);
            expect(await this.agents.connect(this.accounts.user1).isStakedOverMin(AGENT_ID_2)).to.equal(false);
        });

        it('cannot stake on unknown agent', async function () {
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType2, '8743926583', '101')).to.be.revertedWith('StakeInactiveOrSubjectNotFound()');
        });

        it('cannot set unauthorized', async function () {
            await expect(this.agents.connect(this.accounts.user1).setStakeThreshold({ max: '500', min: '100', activated: true })).to.be.revertedWith(
                `MissingRole("${this.roles.AGENT_ADMIN}", "${this.accounts.user1.address}")`
            );
        });

        it('cannot set min > max', async function () {
            await expect(this.agents.connect(this.accounts.manager).setStakeThreshold({ max: '50', min: '100', activated: true })).to.be.revertedWith(
                `StakeThresholdMaxLessOrEqualMin()`
            );
        });
    });

    describe('Set up', function () {
        let fortaStakingParameters;

        beforeEach(async function () {
            const FortaStakingParameters = await ethers.getContractFactory('FortaStakingParameters');
            fortaStakingParameters = await upgrades.deployProxy(FortaStakingParameters, [this.contracts.access.address, this.contracts.staking.address], {
                kind: 'uups',
                constructorArgs: [this.contracts.forwarder.address],
                unsafeAllow: ['delegatecall'],
            });
            await fortaStakingParameters.deployed();
        });
        it('admin methods must be called by admin', async function () {
            await expect(fortaStakingParameters.connect(this.accounts.user1).setFortaStaking(this.contracts.staking.address)).to.be.revertedWith(
                `MissingRole("${this.roles.DEFAULT_ADMIN}", "${this.accounts.user1.address}")`
            );
            await expect(fortaStakingParameters.connect(this.accounts.user1).setStakeSubject(0, this.contracts.staking.address)).to.be.revertedWith(
                `MissingRole("${this.roles.DEFAULT_ADMIN}", "${this.accounts.user1.address}")`
            );
        });

        it('admin methods cannot be called with address 0', async function () {
            await expect(fortaStakingParameters.connect(this.accounts.admin).setFortaStaking(ethers.constants.AddressZero)).to.be.revertedWith('ZeroAddress("newFortaStaking")');
            await expect(fortaStakingParameters.connect(this.accounts.admin).setStakeSubject(0, ethers.constants.AddressZero)).to.be.revertedWith('ZeroAddress("subject")');
        });

        it('subject type must be valid', async function () {
            await expect(fortaStakingParameters.connect(this.accounts.admin).setStakeSubject(4, this.contracts.staking.address)).to.be.revertedWith('InvalidSubjectType(4)');
        });
    });
});
