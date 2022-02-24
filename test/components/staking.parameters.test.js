const { ethers, network } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');
const { subjectToActive, subjectToInactive } = require('../../scripts/utils/staking.js');

const LOCKED_OFFSET = ethers.BigNumber.from(2).pow(160);
const subjects = [
    [ '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 0 ],// Scanner id, scanner type
    [ ethers.BigNumber.from(ethers.utils.id('135a782d-c263-43bd-b70b-920873ed7e9d')), 1 ]// Agent id, agent type
]
const [
    [ subject1, subjectType1, active1, inactive1 ],
    [ subject2, subjectType2, active2, inactive2 ]

] = subjects.map(items => [items[0], items[1], subjectToActive(items[1], items[0]), subjectToInactive(items[1], items[0])])
const subject3Address = '0xfA73331f4C0E5db9706040968BfA16f2FDFd1b76'; // ethers.Wallet.createRandom().address sometimes creates invalid address
const subject3 = ethers.BigNumber.from(subject3Address);
const prepareCommit = (...args)  => ethers.utils.solidityKeccak256([ 'bytes32', 'address', 'string', 'uint256[]' ], args);

describe('Forta Staking Parameters', function () {
    prepare();
    
    beforeEach(async function () {
        await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.user1.address);
        await this.token.connect(this.accounts.whitelister).grantRole(this.roles.WHITELIST, this.accounts.minter.address);
        await this.token.connect(this.accounts.minter).mint(this.accounts.user1.address, ethers.utils.parseEther('1000'));
        await this.token.connect(this.accounts.user1).approve(this.staking.address, ethers.constants.MaxUint256);
    });
    
    describe('Scanners', function () {
        beforeEach(async function () {
            await this.scanners.connect(this.accounts.manager).adminRegister(ethers.utils.hexValue(subject1), this.accounts.user1.address, 1, 'metadata')
            await this.scanners.connect(this.accounts.manager).adminRegister(subject3Address, this.accounts.user1.address, 2, 'metadata')
    
        });
        it('happy path', async function () {
            expect(await this.stakingParameters.minStakeFor(subjectType1, subject1)).to.equal(0);
            expect(await this.scanners.isStakedOverMin(subject1)).to.equal(true);
            
            await expect(this.scanners.connect(this.accounts.manager).setStakeThreshold({ max: '500', min: '100' }, 1))
            .to.emit(this.scanners, 'StakeThresholdChanged').withArgs('1', '100','500');
            expect(await this.stakingParameters.minStakeFor(subjectType1, subject1)).to.equal(100);
            expect(await this.stakingParameters.maxStakeFor(subjectType1, subject1)).to.equal(500);
            
            expect(await this.scanners.isStakedOverMin(subject1)).to.equal(false);
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '101')).to.not.be.reverted;
            expect(await this.scanners.isStakedOverMin(subject1)).to.equal(true);
            
        });
        
        it('changing general minimum stake reflects on previous staked values', async function () {
            await this.scanners.connect(this.accounts.manager).setStakeThreshold({ max: '500', min: '100' }, 1)
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '101')).to.not.be.reverted;
            await this.scanners.connect(this.accounts.manager).setStakeThreshold({ max: '500', min: '200' }, 1)
            expect(await this.scanners.isStakedOverMin(subject1)).to.equal(false);
            await this.scanners.connect(this.accounts.manager).setStakeThreshold({ max: '500', min: '10' }, 1)
            expect(await this.scanners.isStakedOverMin(subject1)).to.equal(true);

        });

        it ('different stake per chainId', async function () {
            await this.scanners.connect(this.accounts.manager).setStakeThreshold({ max: '500', min: '100' }, 1)
            await this.scanners.connect(this.accounts.manager).setStakeThreshold({ max: '500', min: '200' }, 2)
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject1, '101')).to.not.be.reverted;
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subject3, '200')).to.not.be.reverted;
            expect(await this.scanners.connect(this.accounts.user1).isStakedOverMin(subject1)).to.equal(true);
            expect(await this.scanners.connect(this.accounts.user1).isStakedOverMin(subject3)).to.equal(true);
            await this.scanners.connect(this.accounts.manager).setStakeThreshold({ max: '500', min: '300' }, 2)
            expect(await this.scanners.connect(this.accounts.user1).isStakedOverMin(subject1)).to.equal(true);
            expect(await this.scanners.connect(this.accounts.user1).isStakedOverMin(subject3)).to.equal(false);

        });

        it ('cannot stake on unknown scanner', async function () {
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, ethers.BigNumber.from(ethers.Wallet.createRandom().address), '101'))
            .to.be.revertedWith("FS: max stake 0 or not found")

        });

        it ('cannot stake without max cap set', async function () {
            const subjectInUnititializedChain = ethers.Wallet.createRandom().address
            await this.scanners.connect(this.accounts.manager).adminRegister(ethers.utils.hexValue(subjectInUnititializedChain), this.accounts.user1.address, 3, 'metadata')
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType1, subjectInUnititializedChain, '101'))
            .to.be.revertedWith("FS: max stake 0 or not found")

        });
        
        it ('cannot set unauthorized', async function () {
            await expect(this.scanners.connect(this.accounts.user1).setStakeThreshold({ max: '500', min: '100' }, 1))
            .to.be.revertedWith(`MissingRole("${this.roles.SCANNER_ADMIN}", "${this.accounts.user1.address}")`);
        });

        it ('cannot set min > max', async function () {
            await expect(this.scanners.connect(this.accounts.manager).setStakeThreshold({ max: '50', min: '100' }, 1))
            .to.be.revertedWith(`ScannerRegistryEnable: StakeThreshold max <= min`);
        });


    });

    describe('Agents', function () {
        const AGENT_ID_1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
        const AGENT_ID_2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

        beforeEach(async function () {
            const args1 = [ AGENT_ID_1, this.accounts.user1.address, 'Metadata1', [ 1 , 3, 4, 5 ] ];
            await this.agents.prepareAgent(prepareCommit(...args1))
            await network.provider.send('evm_increaseTime', [ 300 ]);
            await this.agents.connect(this.accounts.other).createAgent(...args1)
            const args2 = [ AGENT_ID_2, this.accounts.user1.address, 'Metadata2', [ 1 , 3, 4, 500 ] ];
            await this.agents.prepareAgent(prepareCommit(...args2))
            await network.provider.send('evm_increaseTime', [ 300 ]);
            await this.agents.connect(this.accounts.other).createAgent(...args2)
    
        });
        it('happy path', async function () {
            expect(await this.stakingParameters.minStakeFor(subjectType2, AGENT_ID_1)).to.equal(0);
            expect(await this.agents.isStakedOverMin(AGENT_ID_1)).to.equal(true);
            
            await expect(this.agents.connect(this.accounts.manager).setStakeThreshold({ max: '500', min: '100' }))
            .to.emit(this.agents, 'StakeThresholdChanged').withArgs('100','500');
            expect(await this.stakingParameters.minStakeFor(subjectType2, AGENT_ID_1)).to.equal(100);
            expect(await this.stakingParameters.maxStakeFor(subjectType2, AGENT_ID_1)).to.equal(500);
            
            expect(await this.agents.isStakedOverMin(AGENT_ID_1)).to.equal(false);
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType2, AGENT_ID_1, '101')).to.not.be.reverted;
            expect(await this.agents.isStakedOverMin(AGENT_ID_1)).to.equal(true);

        });
        
        it('changing general minimum stake reflects on previous staked values', async function () {

            await this.agents.connect(this.accounts.manager).setStakeThreshold({ max: '500', min: '100' })
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType2, AGENT_ID_1, '101')).to.not.be.reverted;

            await this.agents.connect(this.accounts.manager).setStakeThreshold({ max: '500', min: '200' })

            expect(await this.agents.isStakedOverMin(AGENT_ID_1)).to.equal(false);

            await this.agents.connect(this.accounts.manager).setStakeThreshold({ max: '500', min: '10' })

            expect(await this.agents.isStakedOverMin(AGENT_ID_1)).to.equal(true);

        });

        it ('same stake min for all agents', async function () {
            await this.agents.connect(this.accounts.manager).setStakeThreshold({ max: '500', min: '100' })
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType2, AGENT_ID_1, '101')).to.not.be.reverted;
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType2, AGENT_ID_2, '200')).to.not.be.reverted;
            expect(await this.agents.connect(this.accounts.user1).isStakedOverMin(AGENT_ID_1)).to.equal(true);
            expect(await this.agents.connect(this.accounts.user1).isStakedOverMin(AGENT_ID_2)).to.equal(true);
            await this.agents.connect(this.accounts.manager).setStakeThreshold({ max: '500', min: '300' })
            expect(await this.agents.connect(this.accounts.user1).isStakedOverMin(AGENT_ID_1)).to.equal(false);
            expect(await this.agents.connect(this.accounts.user1).isStakedOverMin(AGENT_ID_2)).to.equal(false);

        });

        it ('cannot stake on unknown agent', async function () {
            await expect(this.staking.connect(this.accounts.user1).deposit(subjectType2, '8743926583', '101'))
            .to.be.revertedWith("FS: max stake 0 or not found")

        });

        
        it ('cannot set unauthorized', async function () {
            await expect(this.agents.connect(this.accounts.user1).setStakeThreshold({ max: '500', min: '100' }))
            .to.be.revertedWith(`MissingRole("${this.roles.AGENT_ADMIN}", "${this.accounts.user1.address}")`);
        });

        it ('cannot set min > max', async function () {
            await expect(this.agents.connect(this.accounts.manager).setStakeThreshold({ max: '50', min: '100' }))
            .to.be.revertedWith(`AgentRegistryEnable: StakeThreshold max <= min`);
        });


    });

    describe('Set up', function() {

        let fortaStakingParameters;

        beforeEach(async function () {
            const FortaStakingParameters = await ethers.getContractFactory('FortaStakingParameters')
            fortaStakingParameters = await upgrades.deployProxy(
                FortaStakingParameters,
                [ this.contracts.access.address, this.contracts.router.address, this.contracts.staking.address ],
                { 
                    kind: 'uups',
                    constructorArgs: [ this.contracts.forwarder.address ],
                    unsafeAllow: ['delegatecall']
                }
            );
            await fortaStakingParameters.deployed();

        });
        it('admin methods must be called by admin', async function () {
            
            await expect(fortaStakingParameters.connect(this.accounts.user1).setFortaStaking(this.contracts.staking.address))
            .to.be.revertedWith(`MissingRole("${this.roles.DEFAULT_ADMIN}", "${this.accounts.user1.address}")`);
            await expect(fortaStakingParameters.connect(this.accounts.user1).setStakeSubjectHandler(0, this.contracts.staking.address))
            .to.be.revertedWith(`MissingRole("${this.roles.DEFAULT_ADMIN}", "${this.accounts.user1.address}")`);
        });

        it('admin methods cannot be called with address 0', async function () {
            
            await expect(fortaStakingParameters.connect(this.accounts.admin).setFortaStaking(ethers.constants.AddressZero))
            .to.be.revertedWith("FSP: address 0");
            await expect(fortaStakingParameters.connect(this.accounts.admin).setStakeSubjectHandler(0, ethers.constants.AddressZero))
            .to.be.revertedWith("FSP: address 0");
        });

        it('subject type must be valid', async function () {
            await expect(fortaStakingParameters.connect(this.accounts.admin).setStakeSubjectHandler(4, this.contracts.staking.address))
            .to.be.revertedWith("STV: invalid subjectType");
        });
    })
});
