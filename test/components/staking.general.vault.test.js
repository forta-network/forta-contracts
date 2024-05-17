const hre = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { expect } = require('chai');
const { prepare } = require('../fixture');

const oneThousandTokens = ethers.utils.parseUnits('1000');

async function mineDaysWorthOfBlocks(amountOfDays) {
    const twelveSecBlockTime = 12;
    const elevenDaysInBlocks = (60 * 60 * 24 * amountOfDays) / twelveSecBlockTime;
    await hre.network.provider.send("hardhat_mine", ["0x" + elevenDaysInBlocks.toString(16), "0x" + twelveSecBlockTime.toString(16)]);
}

describe('General Forta Staking Vault on Ethereum', function () {
    prepare({ mainnet: true });

    beforeEach(async function () {
        await this.token.connect(this.accounts.minter).mint(this.accounts.user1.address, oneThousandTokens);
        await this.token.connect(this.accounts.minter).mint(this.accounts.user2.address, oneThousandTokens);
        await this.token.connect(this.accounts.minter).mint(this.accounts.user3.address, oneThousandTokens);
        // `admin` serves as the account transferring tokens into the vault as rewards
        await this.token.connect(this.accounts.minter).mint(this.accounts.admin.address, oneThousandTokens);
        
        expect(await this.token.balanceOf(this.accounts.user1.address)).to.equal(oneThousandTokens);
        expect(await this.token.balanceOf(this.accounts.user2.address)).to.equal(oneThousandTokens);
        expect(await this.token.balanceOf(this.accounts.user3.address)).to.equal(oneThousandTokens);

        await this.token.connect(this.accounts.user1).approve(this.generalStaking.address, ethers.constants.MaxUint256);
        await this.token.connect(this.accounts.user2).approve(this.generalStaking.address, ethers.constants.MaxUint256);
        await this.token.connect(this.accounts.user3).approve(this.generalStaking.address, ethers.constants.MaxUint256);
        // `slasher` approves the vault balance of tokens, so that the slashing functionality is executable
        await this.token.connect(this.accounts.slasher).approve(this.generalStaking.address, ethers.constants.MaxUint256);
    });

    describe('Access Control', async function () {
        it('roles check', async function () {
            expect(await this.generalStaking.hasRole(this.roles.ADMIN, this.accounts.admin.address));
            expect(await this.generalStaking.hasRole(this.roles.SLASHER, this.accounts.slasher.address));
        });

        it('only ADMIN can set treasury address', async function () {
            await expect(this.generalStaking.connect(this.accounts.user1).setTreasury(this.accounts.user1.address)).to.be.reverted;

            await expect(this.generalStaking.connect(this.accounts.admin).setTreasury(this.accounts.other.address)).to.not.be.reverted;
        });

        it('only ADMIN can set withdrawal delay', async function () {
            const twoDaysInSecs = 60 * 60 * 24 * 2;
            await expect(this.generalStaking.connect(this.accounts.user1).setDelay(twoDaysInSecs)).to.be.reverted;

            await expect(this.generalStaking.connect(this.accounts.admin).setDelay(twoDaysInSecs)).to.not.be.reverted;
        })
    });

    describe('Staking', async function () {
        it('single depositor stakes and receives vault shares', async function () {
            const twoHundredTokens = ethers.utils.parseUnits('200');
            expect(await this.generalStaking.balanceOf(this.accounts.user1.address)).to.equal(ethers.constants.Zero);

            expect(await this.generalStaking.totalSupply()).to.equal(ethers.constants.Zero);
            expect(await this.generalStaking.totalAssets()).to.equal(ethers.constants.Zero);

            await expect(this.generalStaking.connect(this.accounts.user1).deposit(twoHundredTokens, this.accounts.user1.address)).to.be.not.reverted;

            expect(await this.token.balanceOf(this.accounts.user1.address)).to.equal((oneThousandTokens.sub(twoHundredTokens)));
            // two hundred, since `user1` is the only depositor right now
            expect(await this.generalStaking.balanceOf(this.accounts.user1.address)).to.equal(twoHundredTokens);
            expect(await this.generalStaking.totalSupply()).to.equal(twoHundredTokens);
            expect(await this.generalStaking.totalAssets()).to.equal(twoHundredTokens);
        });

        it('multiple depositors stake and receive vault shares', async function () {
            const twoHundredTokens = ethers.utils.parseUnits('200');
            const oneHundredFiftyTokens = ethers.utils.parseUnits('150');
            const threeHundredFifteenTokens = ethers.utils.parseUnits('315');

            expect(await this.generalStaking.balanceOf(this.accounts.user1.address)).to.equal(ethers.constants.Zero);
            expect(await this.generalStaking.balanceOf(this.accounts.user2.address)).to.equal(ethers.constants.Zero);
            expect(await this.generalStaking.balanceOf(this.accounts.user3.address)).to.equal(ethers.constants.Zero);

            expect(await this.generalStaking.totalSupply()).to.equal(ethers.constants.Zero);
            expect(await this.generalStaking.totalAssets()).to.equal(ethers.constants.Zero);

            await expect(this.generalStaking.connect(this.accounts.user1).deposit(twoHundredTokens, this.accounts.user1.address)).to.be.not.reverted;
            await expect(this.generalStaking.connect(this.accounts.user2).deposit(oneHundredFiftyTokens, this.accounts.user2.address)).to.be.not.reverted;
            await expect(this.generalStaking.connect(this.accounts.user3).deposit(threeHundredFifteenTokens, this.accounts.user3.address)).to.be.not.reverted;

            expect(await this.token.balanceOf(this.accounts.user1.address)).to.equal((oneThousandTokens.sub(twoHundredTokens)));
            expect(await this.token.balanceOf(this.accounts.user2.address)).to.equal((oneThousandTokens.sub(oneHundredFiftyTokens)));
            expect(await this.token.balanceOf(this.accounts.user3.address)).to.equal((oneThousandTokens.sub(threeHundredFifteenTokens)));

            // 1:1 exchange rate between vault's assets and shares
            // because vault has not earned additional assets as rewards
            expect(await this.generalStaking.balanceOf(this.accounts.user1.address)).to.equal(twoHundredTokens);
            expect(await this.generalStaking.balanceOf(this.accounts.user2.address)).to.equal(oneHundredFiftyTokens);
            expect(await this.generalStaking.balanceOf(this.accounts.user3.address)).to.equal(threeHundredFifteenTokens);

            const totalTokensDeposited = twoHundredTokens.add(oneHundredFiftyTokens.add(threeHundredFifteenTokens));
            expect(await this.generalStaking.totalSupply()).to.equal(totalTokensDeposited);
            expect(await this.generalStaking.totalAssets()).to.equal(totalTokensDeposited);
        });

        it('multiple depositors stake, receive vault shares, and redeem their shares for vault underlying assets after withdrawal delay', async function () {
            const twoHundredTokens = ethers.utils.parseUnits('200');
            const oneHundredFiftyTokens = ethers.utils.parseUnits('150');
            const threeHundredFifteenTokens = ethers.utils.parseUnits('315');

            expect(await this.generalStaking.balanceOf(this.accounts.user1.address)).to.equal(ethers.constants.Zero);
            expect(await this.generalStaking.balanceOf(this.accounts.user2.address)).to.equal(ethers.constants.Zero);
            expect(await this.generalStaking.balanceOf(this.accounts.user3.address)).to.equal(ethers.constants.Zero);

            expect(await this.generalStaking.totalSupply()).to.equal(ethers.constants.Zero);
            expect(await this.generalStaking.totalAssets()).to.equal(ethers.constants.Zero);

            await expect(this.generalStaking.connect(this.accounts.user1).deposit(twoHundredTokens, this.accounts.user1.address)).to.be.not.reverted;
            await expect(this.generalStaking.connect(this.accounts.user2).deposit(oneHundredFiftyTokens, this.accounts.user2.address)).to.be.not.reverted;
            await expect(this.generalStaking.connect(this.accounts.user3).deposit(threeHundredFifteenTokens, this.accounts.user3.address)).to.be.not.reverted;

            expect(await this.token.balanceOf(this.accounts.user1.address)).to.equal((oneThousandTokens.sub(twoHundredTokens)));
            expect(await this.token.balanceOf(this.accounts.user2.address)).to.equal((oneThousandTokens.sub(oneHundredFiftyTokens)));
            expect(await this.token.balanceOf(this.accounts.user3.address)).to.equal((oneThousandTokens.sub(threeHundredFifteenTokens)));

            // 1:1 exchange rate between vault's assets and shares
            // because vault has not earned additional assets as rewards
            expect(await this.generalStaking.balanceOf(this.accounts.user1.address)).to.equal(twoHundredTokens);
            expect(await this.generalStaking.balanceOf(this.accounts.user2.address)).to.equal(oneHundredFiftyTokens);
            expect(await this.generalStaking.balanceOf(this.accounts.user3.address)).to.equal(threeHundredFifteenTokens);

            const totalTokensDeposited = twoHundredTokens.add(oneHundredFiftyTokens.add(threeHundredFifteenTokens));
            expect(await this.generalStaking.totalSupply()).to.equal(totalTokensDeposited);
            expect(await this.generalStaking.totalAssets()).to.equal(totalTokensDeposited);



            const user1MaxRedeemShares = await this.generalStaking.connect(this.accounts.user1).maxRedeem(this.accounts.user1.address);
            await expect(this.generalStaking.connect(this.accounts.user1).redeem(user1MaxRedeemShares, this.accounts.user1.address, this.accounts.user1.address)).to.be.revertedWith('WithdrawalNotReady()');

            const user2MaxRedeemShares = await this.generalStaking.connect(this.accounts.user2).maxRedeem(this.accounts.user2.address);
            await expect(this.generalStaking.connect(this.accounts.user2).redeem(user2MaxRedeemShares, this.accounts.user2.address, this.accounts.user2.address)).to.be.revertedWith('WithdrawalNotReady()');

            const user3MaxRedeemShares = await this.generalStaking.connect(this.accounts.user3).maxRedeem(this.accounts.user3.address);
            await expect(this.generalStaking.connect(this.accounts.user3).redeem(user3MaxRedeemShares, this.accounts.user3.address, this.accounts.user3.address)).to.be.revertedWith('WithdrawalNotReady()');


            // Mine eleven day's worth of blocks
            await mineDaysWorthOfBlocks(11);


            await expect(this.generalStaking.connect(this.accounts.user1).redeem(user1MaxRedeemShares, this.accounts.user1.address, this.accounts.user1.address)).to.be.not.reverted;

            // Post `user1` redemption checks
            expect(await this.token.balanceOf(this.accounts.user1.address)).to.equal((oneThousandTokens));
            expect(await this.generalStaking.balanceOf(this.accounts.user1.address)).to.equal(ethers.constants.Zero);

            expect(await this.generalStaking.totalSupply()).to.equal(totalTokensDeposited.sub(twoHundredTokens));
            expect(await this.generalStaking.totalAssets()).to.equal(totalTokensDeposited.sub(twoHundredTokens));


            await expect(this.generalStaking.connect(this.accounts.user2).redeem(user2MaxRedeemShares, this.accounts.user2.address, this.accounts.user2.address)).to.be.not.reverted;

            // Post `user2` redemption checks
            expect(await this.token.balanceOf(this.accounts.user2.address)).to.equal((oneThousandTokens));
            expect(await this.generalStaking.balanceOf(this.accounts.user2.address)).to.equal(ethers.constants.Zero);
            // Only `user3` remains staked in the vault
            expect(await this.generalStaking.totalSupply()).to.equal(threeHundredFifteenTokens);
            expect(await this.generalStaking.totalAssets()).to.equal(threeHundredFifteenTokens);


            await expect(this.generalStaking.connect(this.accounts.user3).redeem(user3MaxRedeemShares, this.accounts.user3.address, this.accounts.user3.address)).to.be.not.reverted;

            // Post `user3` redemption checks
            expect(await this.token.balanceOf(this.accounts.user3.address)).to.equal(oneThousandTokens);
            expect(await this.generalStaking.balanceOf(this.accounts.user1.address)).to.equal(ethers.constants.Zero);
            expect(await this.generalStaking.balanceOf(this.accounts.user2.address)).to.equal(ethers.constants.Zero);
            expect(await this.generalStaking.balanceOf(this.accounts.user3.address)).to.equal(ethers.constants.Zero);

            // No stakers remaining
            expect(await this.generalStaking.totalSupply()).to.equal(ethers.constants.Zero);
            expect(await this.generalStaking.totalAssets()).to.equal(ethers.constants.Zero);
        });
    });

    describe('Rewards', async function () {
        it('single depositor stakes, receives vault shares, and redeems for assets plus rewards after withdrawal delay', async function () {
            const twoHundredTokens = ethers.utils.parseUnits('200');
            expect(await this.generalStaking.balanceOf(this.accounts.user1.address)).to.equal(ethers.constants.Zero);
            expect(await this.generalStaking.totalSupply()).to.equal(ethers.constants.Zero);
            expect(await this.generalStaking.totalAssets()).to.equal(ethers.constants.Zero);

            await expect(this.generalStaking.connect(this.accounts.user1).deposit(twoHundredTokens, this.accounts.user1.address)).to.be.not.reverted;

            expect(await this.token.balanceOf(this.accounts.user1.address)).to.equal((oneThousandTokens.sub(twoHundredTokens)));
            // two hundred, since `user1` is the only depositor right now
            expect(await this.generalStaking.balanceOf(this.accounts.user1.address)).to.equal(twoHundredTokens);
            expect(await this.generalStaking.totalSupply()).to.equal(twoHundredTokens);
            expect(await this.generalStaking.totalAssets()).to.equal(twoHundredTokens);

            const fiftyTokensRewarded = ethers.utils.parseUnits('50');
            // reward `50` tokens to vault
            await this.token.connect(this.accounts.admin).transfer(this.generalStaking.address, fiftyTokensRewarded);

            expect(await this.token.balanceOf(this.accounts.admin.address)).to.equal((oneThousandTokens.sub(fiftyTokensRewarded)));
            // Since it was a `transfer` instead of `mint`/`deposit`, vault shares do not increase
            expect(await this.generalStaking.totalSupply()).to.equal(twoHundredTokens);
            // However, total underlying assets do increase
            expect(await this.generalStaking.totalAssets()).to.equal(twoHundredTokens.add(fiftyTokensRewarded));

            const user1MaxRedeemShares = await this.generalStaking.connect(this.accounts.user1).maxRedeem(this.accounts.user1.address);
            await expect(this.generalStaking.connect(this.accounts.user1).redeem(user1MaxRedeemShares, this.accounts.user1.address, this.accounts.user1.address)).to.be.revertedWith('WithdrawalNotReady()');

            // Mine eleven day's worth of blocks
            await mineDaysWorthOfBlocks(11);

            await expect(this.generalStaking.connect(this.accounts.user1).redeem(user1MaxRedeemShares, this.accounts.user1.address, this.accounts.user1.address)).to.be.not.reverted;

            // Post `user1` redemption checks
            expect(await this.token.balanceOf(this.accounts.user1.address)).to.be.above(oneThousandTokens);
            expect(await this.generalStaking.balanceOf(this.accounts.user1.address)).to.equal(ethers.constants.Zero);

            // No stakers remaining
            expect(await this.generalStaking.totalSupply()).to.equal(ethers.constants.Zero);
        });

        it('multiple depositors stake, receive vault rewards, and redeem for assets plus rewards after withdrawal delay', async function () {
            const twoHundredTokens = ethers.utils.parseUnits('200');
            const oneHundredFiftyTokens = ethers.utils.parseUnits('150');
            const threeHundredFifteenTokens = ethers.utils.parseUnits('315');

            expect(await this.generalStaking.balanceOf(this.accounts.user1.address)).to.equal(ethers.constants.Zero);
            expect(await this.generalStaking.balanceOf(this.accounts.user2.address)).to.equal(ethers.constants.Zero);
            expect(await this.generalStaking.balanceOf(this.accounts.user3.address)).to.equal(ethers.constants.Zero);

            expect(await this.generalStaking.totalSupply()).to.equal(ethers.constants.Zero);
            expect(await this.generalStaking.totalAssets()).to.equal(ethers.constants.Zero);

            await expect(this.generalStaking.connect(this.accounts.user1).deposit(twoHundredTokens, this.accounts.user1.address)).to.be.not.reverted;
            await expect(this.generalStaking.connect(this.accounts.user2).deposit(oneHundredFiftyTokens, this.accounts.user2.address)).to.be.not.reverted;
            await expect(this.generalStaking.connect(this.accounts.user3).deposit(threeHundredFifteenTokens, this.accounts.user3.address)).to.be.not.reverted;

            expect(await this.token.balanceOf(this.accounts.user1.address)).to.equal((oneThousandTokens.sub(twoHundredTokens)));
            expect(await this.token.balanceOf(this.accounts.user2.address)).to.equal((oneThousandTokens.sub(oneHundredFiftyTokens)));
            expect(await this.token.balanceOf(this.accounts.user3.address)).to.equal((oneThousandTokens.sub(threeHundredFifteenTokens)));

            // 1:1 exchange rate between vault's assets and shares
            // because vault has not earned additional assets as rewards
            expect(await this.generalStaking.balanceOf(this.accounts.user1.address)).to.equal(twoHundredTokens);
            expect(await this.generalStaking.balanceOf(this.accounts.user2.address)).to.equal(oneHundredFiftyTokens);
            expect(await this.generalStaking.balanceOf(this.accounts.user3.address)).to.equal(threeHundredFifteenTokens);

            const totalTokensDeposited = twoHundredTokens.add(oneHundredFiftyTokens.add(threeHundredFifteenTokens));
            expect(await this.generalStaking.totalSupply()).to.equal(totalTokensDeposited);
            expect(await this.generalStaking.totalAssets()).to.equal(totalTokensDeposited);


            const fiveHundredTokensRewarded = ethers.utils.parseUnits('500');
            // reward `500` tokens to vault
            await this.token.connect(this.accounts.admin).transfer(this.generalStaking.address, fiveHundredTokensRewarded);


            expect(await this.token.balanceOf(this.accounts.admin.address)).to.equal((oneThousandTokens.sub(fiveHundredTokensRewarded)));
            // Since it was a `transfer` instead of `mint`/`deposit`, vault shares do not increase
            expect(await this.generalStaking.totalSupply()).to.equal(totalTokensDeposited);
            // However, total underlying assets do increase
            expect(await this.generalStaking.totalAssets()).to.equal(totalTokensDeposited.add(fiveHundredTokensRewarded));

            const user1MaxRedeemShares = await this.generalStaking.connect(this.accounts.user1).maxRedeem(this.accounts.user1.address);
            const user2MaxRedeemShares = await this.generalStaking.connect(this.accounts.user2).maxRedeem(this.accounts.user2.address);
            const user3MaxRedeemShares = await this.generalStaking.connect(this.accounts.user3).maxRedeem(this.accounts.user3.address);


            await expect(this.generalStaking.connect(this.accounts.user1).redeem(user1MaxRedeemShares, this.accounts.user1.address, this.accounts.user1.address)).to.be.revertedWith('WithdrawalNotReady()');
            await expect(this.generalStaking.connect(this.accounts.user2).redeem(user2MaxRedeemShares, this.accounts.user2.address, this.accounts.user2.address)).to.be.revertedWith('WithdrawalNotReady()');
            await expect(this.generalStaking.connect(this.accounts.user3).redeem(user3MaxRedeemShares, this.accounts.user3.address, this.accounts.user3.address)).to.be.revertedWith('WithdrawalNotReady()');


            // Mine eleven day's worth of blocks
            await mineDaysWorthOfBlocks(11);


            const user1PreviewRedeemReturnedAssets = await this.generalStaking.connect(this.accounts.user1).previewRedeem(user1MaxRedeemShares);
            const user1TokenBalanceBeforeRedemption = await this.token.balanceOf(this.accounts.user1.address);

            await expect(this.generalStaking.connect(this.accounts.user1).redeem(user1MaxRedeemShares, this.accounts.user1.address, this.accounts.user1.address)).to.be.not.reverted;

            const user1TokenBalancePlusRewards = user1TokenBalanceBeforeRedemption.add(user1PreviewRedeemReturnedAssets);
            // Post `user1` redemption checks
            expect(await this.token.balanceOf(this.accounts.user1.address)).to.equal(user1TokenBalancePlusRewards);
            // Confirm redeemed assets are greater than the one thousand that was started with
            expect(user1TokenBalancePlusRewards).to.be.above(oneThousandTokens);
            expect(await this.generalStaking.balanceOf(this.accounts.user1.address)).to.equal(ethers.constants.Zero);



            const user2PreviewRedeemReturnedAssets = await this.generalStaking.connect(this.accounts.user2).previewRedeem(user2MaxRedeemShares);
            const user2TokenBalanceBeforeRedemption = await this.token.balanceOf(this.accounts.user2.address);

            await expect(this.generalStaking.connect(this.accounts.user2).redeem(user2MaxRedeemShares, this.accounts.user2.address, this.accounts.user2.address)).to.be.not.reverted;

            const user2TokenBalancePlusRewards = user2TokenBalanceBeforeRedemption.add(user2PreviewRedeemReturnedAssets);
            // Post `user2` redemption checks
            expect(await this.token.balanceOf(this.accounts.user2.address)).to.equal(user2TokenBalancePlusRewards);
            // Confirm redeemed assets are greater than the one thousand that was started with
            expect(user2TokenBalancePlusRewards).to.be.above(oneThousandTokens);
            expect(await this.generalStaking.balanceOf(this.accounts.user2.address)).to.equal(ethers.constants.Zero);



            const user3PreviewRedeemReturnedAssets = await this.generalStaking.connect(this.accounts.user3).previewRedeem(user3MaxRedeemShares);
            const user3TokenBalanceBeforeRedemption = await this.token.balanceOf(this.accounts.user3.address);

            await expect(this.generalStaking.connect(this.accounts.user3).redeem(user3MaxRedeemShares, this.accounts.user3.address, this.accounts.user3.address)).to.be.not.reverted;

            const user3TokenBalancePlusRewards = user3TokenBalanceBeforeRedemption.add(user3PreviewRedeemReturnedAssets);
            // Post `user3` redemption checks
            expect(await this.token.balanceOf(this.accounts.user3.address)).to.equal(user3TokenBalancePlusRewards);
            // Confirm redeemed assets are greater than the one thousand that was started with
            expect(user3TokenBalancePlusRewards).to.be.above(oneThousandTokens);
            expect(await this.generalStaking.balanceOf(this.accounts.user3.address)).to.equal(ethers.constants.Zero);

            // No stakers remaining
            expect(await this.generalStaking.totalSupply()).to.equal(ethers.constants.Zero);
        });

        it.skip('checks if an earlier depositor get diluted by later depositors into the General Staking Vault', async function () {
            await expect(this.generalStaking.connect(this.accounts.user1).deposit(ethers.utils.parseUnits('200'), this.accounts.user1.address)).to.be.not.reverted;

            let user1MaxRedeemShares = await this.generalStaking.connect(this.accounts.user1).maxRedeem(this.accounts.user1.address);
            let user1PreviewRedeemReturnedAssets = await this.generalStaking.connect(this.accounts.user1).previewRedeem(user1MaxRedeemShares);
            console.log(`\nuser1PreviewRedeemReturnedAssets - after deposit: ${user1PreviewRedeemReturnedAssets}`);                                           // 200.000000000000000000 (shares amount: 200)

            await this.token.connect(this.accounts.admin).transfer(this.generalStaking.address, ethers.utils.parseUnits('500'));

            user1MaxRedeemShares = await this.generalStaking.connect(this.accounts.user1).maxRedeem(this.accounts.user1.address);
            user1PreviewRedeemReturnedAssets = await this.generalStaking.connect(this.accounts.user1).previewRedeem(user1MaxRedeemShares);
            console.log(`\nuser1PreviewRedeemReturnedAssets - right after reward: ${user1PreviewRedeemReturnedAssets}`);                                      // 699.999999999999999997 (shares amount: 200)


            console.log(`time BEFORE block mining: ${await helpers.time.latest()}`);
            // Mine one week's worth of blocks with a block time of 12 seconds
            await hre.network.provider.send("hardhat_mine", ["0xc4e0", "0xc"]);
            console.log(`time AFTER block mining: ${await helpers.time.latest()}`);


            user1MaxRedeemShares = await this.generalStaking.connect(this.accounts.user1).maxRedeem(this.accounts.user1.address);
            user1PreviewRedeemReturnedAssets = await this.generalStaking.connect(this.accounts.user1).previewRedeem(user1MaxRedeemShares);
            console.log(`\nuser1PreviewRedeemReturnedAssets - after 1000 blocks mined: ${user1PreviewRedeemReturnedAssets}`);                                 // 699.999999999999999997 (shares amount: 200)

            await expect(this.generalStaking.connect(this.accounts.user2).deposit(ethers.utils.parseUnits('200'), this.accounts.user2.address)).to.be.not.reverted;
            await expect(this.generalStaking.connect(this.accounts.user3).deposit(ethers.utils.parseUnits('200'), this.accounts.user3.address)).to.be.not.reverted;

            user1MaxRedeemShares = await this.generalStaking.connect(this.accounts.user1).maxRedeem(this.accounts.user1.address);
            user1PreviewRedeemReturnedAssets = await this.generalStaking.connect(this.accounts.user1).previewRedeem(user1MaxRedeemShares);
            console.log(`\nuser1PreviewRedeemReturnedAssets - after users 1 & 2 deposit: ${user1PreviewRedeemReturnedAssets}`);                                 // 699.999999999999999997 (shares amount: 200)

            let user2MaxRedeemShares = await this.generalStaking.connect(this.accounts.user2).maxRedeem(this.accounts.user2.address);
            let user2PreviewRedeemReturnedAssets = await this.generalStaking.connect(this.accounts.user2).previewRedeem(user2MaxRedeemShares);
            console.log(`\nuser2PreviewRedeemReturnedAssets - after deposit & reward: ${user2PreviewRedeemReturnedAssets}`);                                    // 199.999999999999999999 (shares amount: 200)

            let user3MaxRedeemShares = await this.generalStaking.connect(this.accounts.user3).maxRedeem(this.accounts.user3.address);
            let user3PreviewRedeemReturnedAssets = await this.generalStaking.connect(this.accounts.user3).previewRedeem(user3MaxRedeemShares);
            console.log(`\nuser3PreviewRedeemReturnedAssets - after deposit & reward : ${user3PreviewRedeemReturnedAssets}`);                                   // 199.999999999999999999 (shares amount: 200)
        });
    });

    describe('Slashing', async function () {
        it('single depositor stakes, receives vault shares, vault gets slashed, and redeems for less assets than deposited after withdrawal delay', async function () {
            const twoHundredTokens = ethers.utils.parseUnits('200');
            expect(await this.generalStaking.balanceOf(this.accounts.user1.address)).to.equal(ethers.constants.Zero);
            expect(await this.generalStaking.totalSupply()).to.equal(ethers.constants.Zero);
            expect(await this.generalStaking.totalAssets()).to.equal(ethers.constants.Zero);

            await expect(this.generalStaking.connect(this.accounts.user1).deposit(twoHundredTokens, this.accounts.user1.address)).to.be.not.reverted;

            expect(await this.token.balanceOf(this.accounts.user1.address)).to.equal((oneThousandTokens.sub(twoHundredTokens)));
            expect(await this.generalStaking.balanceOf(this.accounts.user1.address)).to.equal(twoHundredTokens);
            // two hundred, since `user1` is the only depositor right now
            expect(await this.generalStaking.totalSupply()).to.equal(twoHundredTokens);
            expect(await this.generalStaking.totalAssets()).to.equal(twoHundredTokens);


            const fiftyTokensSlashed = ethers.utils.parseUnits('50');
            // slash `50` tokens from vault
            await this.generalStaking.connect(this.accounts.slasher).slash(fiftyTokensSlashed);

            // Though vault was slashed, total supply of shares remains unchanged
            expect(await this.generalStaking.totalSupply()).to.equal(twoHundredTokens);
            // However, total underlying assets do decrease
            expect(await this.generalStaking.totalAssets()).to.equal(twoHundredTokens.sub(fiftyTokensSlashed));

            const user1MaxRedeemShares = await this.generalStaking.connect(this.accounts.user1).maxRedeem(this.accounts.user1.address);
            const user1PreviewRedeemReturnedAssets = await this.generalStaking.connect(this.accounts.user1).previewRedeem(user1MaxRedeemShares);
            const user1TokenBalanceBeforeRedemption = await this.token.balanceOf(this.accounts.user1.address);

            await expect(this.generalStaking.connect(this.accounts.user1).redeem(user1MaxRedeemShares, this.accounts.user1.address, this.accounts.user1.address)).to.be.revertedWith('WithdrawalNotReady()');

            // Mine eleven day's worth of blocks
            await mineDaysWorthOfBlocks(11);

            await expect(this.generalStaking.connect(this.accounts.user1).redeem(user1MaxRedeemShares, this.accounts.user1.address, this.accounts.user1.address)).to.be.not.reverted;

            const user1TokenBalance = user1TokenBalanceBeforeRedemption.add(user1PreviewRedeemReturnedAssets);
            // Post `user1` redemption checks
            expect(await this.token.balanceOf(this.accounts.user1.address)).to.equal(user1TokenBalance);
            // Confirm redeemed assets are lesser than the one thousand that was started with
            expect(user1TokenBalance).to.be.below(oneThousandTokens);
            expect(await this.generalStaking.balanceOf(this.accounts.user1.address)).to.equal(ethers.constants.Zero);
            // No stakers remaining
            expect(await this.generalStaking.totalSupply()).to.equal(ethers.constants.Zero);
        });

        it('multiple depositors stake, receive vault shares, vault gets slashed, and redeem for less than depositor after withdrawal delay', async function () {
            const twoHundredTokens = ethers.utils.parseUnits('200');
            const oneHundredFiftyTokens = ethers.utils.parseUnits('150');
            const threeHundredFifteenTokens = ethers.utils.parseUnits('315');

            expect(await this.generalStaking.balanceOf(this.accounts.user1.address)).to.equal(ethers.constants.Zero);
            expect(await this.generalStaking.balanceOf(this.accounts.user2.address)).to.equal(ethers.constants.Zero);
            expect(await this.generalStaking.balanceOf(this.accounts.user3.address)).to.equal(ethers.constants.Zero);

            expect(await this.generalStaking.totalSupply()).to.equal(ethers.constants.Zero);
            expect(await this.generalStaking.totalAssets()).to.equal(ethers.constants.Zero);

            await expect(this.generalStaking.connect(this.accounts.user1).deposit(twoHundredTokens, this.accounts.user1.address)).to.be.not.reverted;
            await expect(this.generalStaking.connect(this.accounts.user2).deposit(oneHundredFiftyTokens, this.accounts.user2.address)).to.be.not.reverted;
            await expect(this.generalStaking.connect(this.accounts.user3).deposit(threeHundredFifteenTokens, this.accounts.user3.address)).to.be.not.reverted;

            expect(await this.token.balanceOf(this.accounts.user1.address)).to.equal((oneThousandTokens.sub(twoHundredTokens)));
            expect(await this.token.balanceOf(this.accounts.user2.address)).to.equal((oneThousandTokens.sub(oneHundredFiftyTokens)));
            expect(await this.token.balanceOf(this.accounts.user3.address)).to.equal((oneThousandTokens.sub(threeHundredFifteenTokens)));

            // 1:1 exchange rate between vault's assets and shares
            // because vault has not earned additional assets as rewards
            expect(await this.generalStaking.balanceOf(this.accounts.user1.address)).to.equal(twoHundredTokens);
            expect(await this.generalStaking.balanceOf(this.accounts.user2.address)).to.equal(oneHundredFiftyTokens);
            expect(await this.generalStaking.balanceOf(this.accounts.user3.address)).to.equal(threeHundredFifteenTokens);

            const totalTokensDeposited = twoHundredTokens.add(oneHundredFiftyTokens.add(threeHundredFifteenTokens));
            expect(await this.generalStaking.totalSupply()).to.equal(totalTokensDeposited);
            expect(await this.generalStaking.totalAssets()).to.equal(totalTokensDeposited);


            const oneHundredFiftyTokensSlashed = ethers.utils.parseUnits('150');
            // slash `150` tokens from vault
            await this.generalStaking.connect(this.accounts.slasher).slash(oneHundredFiftyTokensSlashed);


            expect(await this.generalStaking.totalSupply()).to.equal(totalTokensDeposited);
            // However, total underlying assets do decrease
            expect(await this.generalStaking.totalAssets()).to.equal(totalTokensDeposited.sub(oneHundredFiftyTokensSlashed));

            const user1MaxRedeemShares = await this.generalStaking.connect(this.accounts.user1).maxRedeem(this.accounts.user1.address);
            const user2MaxRedeemShares = await this.generalStaking.connect(this.accounts.user2).maxRedeem(this.accounts.user2.address);
            const user3MaxRedeemShares = await this.generalStaking.connect(this.accounts.user3).maxRedeem(this.accounts.user3.address);


            await expect(this.generalStaking.connect(this.accounts.user1).redeem(user1MaxRedeemShares, this.accounts.user1.address, this.accounts.user1.address)).to.be.revertedWith('WithdrawalNotReady()');
            await expect(this.generalStaking.connect(this.accounts.user2).redeem(user2MaxRedeemShares, this.accounts.user2.address, this.accounts.user2.address)).to.be.revertedWith('WithdrawalNotReady()');
            await expect(this.generalStaking.connect(this.accounts.user3).redeem(user3MaxRedeemShares, this.accounts.user3.address, this.accounts.user3.address)).to.be.revertedWith('WithdrawalNotReady()');


            // Mine eleven day's worth of blocks
            await mineDaysWorthOfBlocks(11);


            const user1PreviewRedeemReturnedAssets = await this.generalStaking.connect(this.accounts.user1).previewRedeem(user1MaxRedeemShares);
            const user1TokenBalanceBeforeRedemption = await this.token.balanceOf(this.accounts.user1.address);

            await expect(this.generalStaking.connect(this.accounts.user1).redeem(user1MaxRedeemShares, this.accounts.user1.address, this.accounts.user1.address)).to.be.not.reverted;

            const user1TokenBalance = user1TokenBalanceBeforeRedemption.add(user1PreviewRedeemReturnedAssets);
            // Post `user1` redemption checks
            expect(await this.token.balanceOf(this.accounts.user1.address)).to.equal(user1TokenBalance);
            // Confirm redeemed assets are lesser than the one thousand that was started with
            expect(user1TokenBalance).to.be.below(oneThousandTokens);
            expect(await this.generalStaking.balanceOf(this.accounts.user1.address)).to.equal(ethers.constants.Zero);



            const user2PreviewRedeemReturnedAssets = await this.generalStaking.connect(this.accounts.user2).previewRedeem(user2MaxRedeemShares);
            const user2TokenBalanceBeforeRedemption = await this.token.balanceOf(this.accounts.user2.address);

            await expect(this.generalStaking.connect(this.accounts.user2).redeem(user2MaxRedeemShares, this.accounts.user2.address, this.accounts.user2.address)).to.be.not.reverted;

            const user2TokenBalance = user2TokenBalanceBeforeRedemption.add(user2PreviewRedeemReturnedAssets);
            // Post `user2` redemption checks
            expect(await this.token.balanceOf(this.accounts.user2.address)).to.equal(user2TokenBalance);
            // Confirm redeemed assets are lesser than the one thousand that was started with
            expect(user2TokenBalance).to.be.below(oneThousandTokens);
            expect(await this.generalStaking.balanceOf(this.accounts.user2.address)).to.equal(ethers.constants.Zero);



            const user3PreviewRedeemReturnedAssets = await this.generalStaking.connect(this.accounts.user3).previewRedeem(user3MaxRedeemShares);
            const user3TokenBalanceBeforeRedemption = await this.token.balanceOf(this.accounts.user3.address);

            await expect(this.generalStaking.connect(this.accounts.user3).redeem(user3MaxRedeemShares, this.accounts.user3.address, this.accounts.user3.address)).to.be.not.reverted;

            const user3TokenBalance = user3TokenBalanceBeforeRedemption.add(user3PreviewRedeemReturnedAssets);
            // Post `user3` redemption checks
            expect(await this.token.balanceOf(this.accounts.user3.address)).to.equal(user3TokenBalance);
            // Confirm redeemed assets are lesser than the one thousand that was started with
            expect(user3TokenBalance).to.be.below(oneThousandTokens);
            expect(await this.generalStaking.balanceOf(this.accounts.user3.address)).to.equal(ethers.constants.Zero);

            // No stakers remaining
            expect(await this.generalStaking.totalSupply()).to.equal(ethers.constants.Zero);
        })
    });
});