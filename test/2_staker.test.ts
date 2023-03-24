import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { deployments, ethers } from 'hardhat';
import {
    Vrsw,
    GVrsw,
    VStakerFactory,
    VStaker,
    VMinter,
    Token0,
} from '../typechain-types';
import { time } from '@nomicfoundation/hardhat-network-helpers';

describe('vStaker', function () {
    let stakerFactory: VStakerFactory;
    let vrsw: Vrsw;
    let gVrsw: GVrsw;
    let token0: Token0;
    let staker: VStaker;
    let accounts: SignerWithAddress[];
    let minter: VMinter;

    before(async () => {
        accounts = await ethers.getSigners();
        await deployments.fixture(['all']);
        stakerFactory = await ethers.getContract('stakerFactory');
        token0 = await ethers.getContract('Token0');
        minter = await ethers.getContract('minter');
        vrsw = await ethers.getContractAt('Vrsw', await minter.vrsw());
        gVrsw = await ethers.getContractAt('GVrsw', await minter.gVrsw());
        await stakerFactory.createPoolStaker(token0.address);
        const stakerAddr = await stakerFactory.getPoolStaker(token0.address);
        staker = await ethers.getContractAt('vStaker', stakerAddr);
        await token0.approve(staker.address, ethers.utils.parseEther('1000'));
        await vrsw.approve(staker.address, ethers.utils.parseEther('1000'));
        await minter.setStakerFactory(stakerFactory.address);
        await minter.setAllocationPoints([staker.address], ['100']);
        await minter.arbitraryTransfer(
            accounts[0].address,
            await minter.unlockedBalance()
        );
    });

    it('stakeLp works', async () => {
        const amount = ethers.utils.parseEther('100');
        const accountBalanceBefore = await token0.balanceOf(
            accounts[0].address
        );
        const contractBalanceBefore = await token0.balanceOf(staker.address);
        await staker.stakeLp(amount);
        const accountBalanceAfter = await token0.balanceOf(accounts[0].address);
        const contractBalanceAfter = await token0.balanceOf(staker.address);
        const compoundRateGlobal = await staker.compoundRateGlobal();
        expect(accountBalanceAfter).to.be.equal(
            accountBalanceBefore.sub(amount)
        );
        expect(contractBalanceAfter).to.be.equal(
            contractBalanceBefore.add(amount)
        );
        expect(await staker.lpStake(accounts[0].address)).to.equal(amount);
        expect(await staker.mu(accounts[0].address)).to.equal(amount);
        expect(await staker.totalMu()).to.equal(amount);
        expect(await staker.totalVrswAvailable()).to.be.above('0');
        expect(await staker.compoundRateGlobal()).to.be.above('0');
        expect(await staker.totalRewardPoints()).to.be.equal('0');
        expect(await staker.rewardPoints(accounts[0].address)).to.be.equal('0');
        expect(await staker.compoundRate(accounts[0].address)).to.be.equal(
            compoundRateGlobal
        );
    });

    it('stakeLp fails when zero amount', async () => {
        await expect(staker.stakeLp('0')).to.be.revertedWith('zero amount');
    });

    it('unstakeLp works', async () => {
        const amount = ethers.utils.parseEther('50');
        const accountBalanceBefore = await token0.balanceOf(
            accounts[0].address
        );
        const contractBalanceBefore = await token0.balanceOf(staker.address);
        const totalVrswBefore = await staker.totalVrswAvailable();
        const compoundRateGlobalBefore = await staker.compoundRateGlobal();
        await staker.unstakeLp(amount);
        const accountBalanceAfter = await token0.balanceOf(accounts[0].address);
        const contractBalanceAfter = await token0.balanceOf(staker.address);
        const compoundRateGlobal = await staker.compoundRateGlobal();
        const totalRewardPoints = await staker.totalRewardPoints();
        expect(accountBalanceAfter).to.be.equal(
            accountBalanceBefore.add(amount)
        );
        expect(contractBalanceAfter).to.be.equal(
            contractBalanceBefore.sub(amount)
        );
        expect(await staker.lpStake(accounts[0].address)).to.equal(amount);
        expect(await staker.mu(accounts[0].address)).to.equal(amount);
        expect(await staker.totalMu()).to.equal(amount);
        expect(await staker.totalVrswAvailable()).to.be.above(totalVrswBefore);
        expect(await staker.compoundRateGlobal()).to.be.above(
            compoundRateGlobalBefore
        );
        expect(totalRewardPoints).to.be.above('0');
        expect(await staker.rewardPoints(accounts[0].address)).to.be.equal(
            totalRewardPoints
        );
        expect(await staker.compoundRate(accounts[0].address)).to.be.equal(
            compoundRateGlobal
        );
    });

    it('unstakeLp fails when zero amount', async () => {
        await expect(staker.unstakeLp('0')).to.be.revertedWith(
            'insufficient amount'
        );
    });

    it('unstakeLp fails when amount is too big', async () => {
        const amount = await staker.lpStake(accounts[0].address);
        await expect(staker.unstakeLp(amount.add('1'))).to.be.revertedWith(
            'insufficient amount'
        );
    });

    it('claimRewards works', async () => {
        const accountBalanceBefore = await vrsw.balanceOf(accounts[0].address);
        const contractBalanceBefore = await vrsw.balanceOf(minter.address);
        const muBefore = await staker.mu(accounts[0].address);
        const totalMuBefore = await staker.totalMu();
        const totalVrswBefore = await staker.totalVrswAvailable();
        const compoundRateGlobalBefore = await staker.compoundRateGlobal();
        const totalRewardPointsBefore = await staker.totalRewardPoints();
        await staker.claimRewards();
        const totalRewardPointsAfter = await staker.totalRewardPoints();
        const accountBalanceAfter = await vrsw.balanceOf(accounts[0].address);
        const contractBalanceAfter = await vrsw.balanceOf(minter.address);
        const rewardsClaimed = await staker.rewardsClaimed(accounts[0].address);
        const compoundRateGlobalAfter = await staker.compoundRateGlobal();

        expect(accountBalanceAfter).to.be.equal(
            accountBalanceBefore.add(rewardsClaimed)
        );
        expect(contractBalanceAfter).to.be.equal(
            contractBalanceBefore.sub(rewardsClaimed)
        );
        expect(await staker.mu(accounts[0].address)).to.equal(muBefore);
        expect(await staker.totalMu()).to.equal(totalMuBefore);
        expect(await staker.totalVrswAvailable()).to.be.above(totalVrswBefore);
        expect(await staker.compoundRateGlobal()).to.be.above(
            compoundRateGlobalBefore
        );
        expect(totalRewardPointsAfter).to.be.above(totalRewardPointsBefore);
        expect(await staker.rewardPoints(accounts[0].address)).to.be.equal(
            totalRewardPointsAfter
        );
        expect(await staker.compoundRate(accounts[0].address)).to.be.equal(
            compoundRateGlobalAfter
        );
    });

    it('unstakeVrsw fails if there is no stakes', async () => {
        const amount = ethers.utils.parseEther('10');
        await expect(staker.unstakeVrsw(amount)).to.revertedWith('no stakes');
    });

    it('stakeVrsw works', async () => {
        const amount = ethers.utils.parseEther('10');
        const accountBalanceBefore = await vrsw.balanceOf(accounts[0].address);
        const contractBalanceBefore = await vrsw.balanceOf(staker.address);
        const gVrswAccountBalanceBefore = await gVrsw.balanceOf(
            accounts[0].address
        );
        const muBefore = await staker.mu(accounts[0].address);
        const totalMuBefore = await staker.totalMu();
        const totalVrswBefore = await staker.totalVrswAvailable();
        const compoundRateGlobalBefore = await staker.compoundRateGlobal();
        const totalRewardPointsBefore = await staker.totalRewardPoints();
        await staker.stakeVrsw(amount);
        const gVrswAccountBalanceAfter = await gVrsw.balanceOf(
            accounts[0].address
        );
        const totalRewardPointsAfter = await staker.totalRewardPoints();
        const accountBalanceAfter = await vrsw.balanceOf(accounts[0].address);
        const contractBalanceAfter = await vrsw.balanceOf(staker.address);
        const compoundRateGlobalAfter = await staker.compoundRateGlobal();

        expect(accountBalanceAfter).to.be.equal(
            accountBalanceBefore.sub(amount)
        );
        expect(gVrswAccountBalanceAfter).to.be.equal(
            gVrswAccountBalanceBefore.add(amount)
        );
        expect(contractBalanceAfter).to.be.equal(
            contractBalanceBefore.add(amount)
        );
        expect(await staker.mu(accounts[0].address)).to.above(muBefore);
        expect(await staker.totalMu()).to.above(totalMuBefore);
        expect(await staker.totalVrswAvailable()).to.be.above(totalVrswBefore);
        expect(await staker.compoundRateGlobal()).to.be.above(
            compoundRateGlobalBefore
        );
        expect(totalRewardPointsAfter).to.be.above(totalRewardPointsBefore);
        expect(await staker.rewardPoints(accounts[0].address)).to.be.equal(
            totalRewardPointsAfter
        );
        expect(await staker.compoundRate(accounts[0].address)).to.be.equal(
            compoundRateGlobalAfter
        );
        expect((await staker.stakes(accounts[0].address, 0)).amount).to.equal(
            amount
        );
    });

    it('stakeVrsw twice works', async () => {
        await time.setNextBlockTimestamp((await time.latest()) + 10);
        const amount = ethers.utils.parseEther('10');
        const accountBalanceBefore = await vrsw.balanceOf(accounts[0].address);
        const contractBalanceBefore = await vrsw.balanceOf(staker.address);
        const muBefore = await staker.mu(accounts[0].address);
        const totalMuBefore = await staker.totalMu();
        const totalVrswBefore = await staker.totalVrswAvailable();
        const compoundRateGlobalBefore = await staker.compoundRateGlobal();
        const totalRewardPointsBefore = await staker.totalRewardPoints();
        const gVrswAccountBalanceBefore = await gVrsw.balanceOf(
            accounts[0].address
        );
        await staker.stakeVrsw(amount);
        const totalRewardPointsAfter = await staker.totalRewardPoints();
        const accountBalanceAfter = await vrsw.balanceOf(accounts[0].address);
        const contractBalanceAfter = await vrsw.balanceOf(staker.address);
        const compoundRateGlobalAfter = await staker.compoundRateGlobal();
        const gVrswAccountBalanceAfter = await gVrsw.balanceOf(
            accounts[0].address
        );

        expect(accountBalanceAfter).to.be.equal(
            accountBalanceBefore.sub(amount)
        );
        expect(gVrswAccountBalanceAfter).to.be.equal(
            gVrswAccountBalanceBefore.add(amount)
        );
        expect(contractBalanceAfter).to.be.equal(
            contractBalanceBefore.add(amount)
        );
        expect(await staker.mu(accounts[0].address)).to.above(muBefore);
        expect(await staker.totalMu()).to.above(totalMuBefore);
        expect(await staker.totalVrswAvailable()).to.be.above(totalVrswBefore);
        expect(await staker.compoundRateGlobal()).to.be.above(
            compoundRateGlobalBefore
        );
        expect(totalRewardPointsAfter).to.be.above(totalRewardPointsBefore);
        expect(await staker.rewardPoints(accounts[0].address)).to.be.equal(
            totalRewardPointsAfter
        );
        expect(await staker.compoundRate(accounts[0].address)).to.be.equal(
            compoundRateGlobalAfter
        );
        expect((await staker.stakes(accounts[0].address, 0)).amount).to.equal(
            amount.mul(2)
        );
    });

    it('unstakeVrsw works', async () => {
        const amount = (await staker.stakes(accounts[0].address, 0)).amount;
        const accountBalanceBefore = await vrsw.balanceOf(accounts[0].address);
        const contractBalanceBefore = await vrsw.balanceOf(staker.address);
        const muBefore = await staker.mu(accounts[0].address);
        const totalMuBefore = await staker.totalMu();
        const totalVrswBefore = await staker.totalVrswAvailable();
        const compoundRateGlobalBefore = await staker.compoundRateGlobal();
        const totalRewardPointsBefore = await staker.totalRewardPoints();
        const gVrswAccountBalanceBefore = await gVrsw.balanceOf(
            accounts[0].address
        );
        await staker.unstakeVrsw(amount);
        const totalRewardPointsAfter = await staker.totalRewardPoints();
        const accountBalanceAfter = await vrsw.balanceOf(accounts[0].address);
        const contractBalanceAfter = await vrsw.balanceOf(staker.address);
        const compoundRateGlobalAfter = await staker.compoundRateGlobal();
        const gVrswAccountBalanceAfter = await gVrsw.balanceOf(
            accounts[0].address
        );

        expect(accountBalanceAfter).to.be.equal(
            accountBalanceBefore.add(amount)
        );
        expect(gVrswAccountBalanceAfter).to.be.equal(
            gVrswAccountBalanceBefore.sub(amount)
        );
        expect(contractBalanceAfter).to.be.equal(
            contractBalanceBefore.sub(amount)
        );
        expect(await staker.mu(accounts[0].address)).to.below(muBefore);
        expect(await staker.totalMu()).to.below(totalMuBefore);
        expect(await staker.totalVrswAvailable()).to.be.above(totalVrswBefore);
        expect(await staker.compoundRateGlobal()).to.be.above(
            compoundRateGlobalBefore
        );
        expect(totalRewardPointsAfter).to.be.above(totalRewardPointsBefore);
        expect(await staker.rewardPoints(accounts[0].address)).to.be.equal(
            totalRewardPointsAfter
        );
        expect(await staker.compoundRate(accounts[0].address)).to.be.equal(
            compoundRateGlobalAfter
        );
        expect((await staker.stakes(accounts[0].address, 0)).amount).to.equal(
            '0'
        );
    });

    it('unstakeVrsw fails if amount is greater than stakes', async () => {
        const amount = (await staker.stakes(accounts[0].address, 0)).amount.add(
            '1'
        );
        await expect(staker.unstakeVrsw(amount)).to.revertedWith(
            'insufficient amount'
        );
    });

    it('lockVrsw works', async () => {
        const amount = ethers.utils.parseEther('10');
        const accountBalanceBefore = await vrsw.balanceOf(accounts[0].address);
        const contractBalanceBefore = await vrsw.balanceOf(staker.address);
        const muBefore = await staker.mu(accounts[0].address);
        const totalMuBefore = await staker.totalMu();
        const totalVrswBefore = await staker.totalVrswAvailable();
        const compoundRateGlobalBefore = await staker.compoundRateGlobal();
        const totalRewardPointsBefore = await staker.totalRewardPoints();
        const gVrswAccountBalanceBefore = await gVrsw.balanceOf(
            accounts[0].address
        );
        await staker.lockVrsw(amount, '10');
        const totalRewardPointsAfter = await staker.totalRewardPoints();
        const accountBalanceAfter = await vrsw.balanceOf(accounts[0].address);
        const contractBalanceAfter = await vrsw.balanceOf(staker.address);
        const compoundRateGlobalAfter = await staker.compoundRateGlobal();
        const gVrswAccountBalanceAfter = await gVrsw.balanceOf(
            accounts[0].address
        );

        expect(accountBalanceAfter).to.be.equal(
            accountBalanceBefore.sub(amount)
        );
        expect(gVrswAccountBalanceAfter).to.be.equal(
            gVrswAccountBalanceBefore.add(amount)
        );
        expect(contractBalanceAfter).to.be.equal(
            contractBalanceBefore.add(amount)
        );
        expect(await staker.mu(accounts[0].address)).to.above(muBefore);
        expect(await staker.totalMu()).to.above(totalMuBefore);
        expect(await staker.totalVrswAvailable()).to.be.above(totalVrswBefore);
        expect(await staker.compoundRateGlobal()).to.be.above(
            compoundRateGlobalBefore
        );
        expect(totalRewardPointsAfter).to.be.above(totalRewardPointsBefore);
        expect(await staker.rewardPoints(accounts[0].address)).to.be.equal(
            totalRewardPointsAfter
        );
        expect(await staker.compoundRate(accounts[0].address)).to.be.equal(
            compoundRateGlobalAfter
        );
        expect((await staker.stakes(accounts[0].address, 1)).amount).to.equal(
            amount
        );
        expect(await staker.checkLock(accounts[0].address)).to.be.an('array')
            .that.is.empty;
    });

    it('lockVrsw fails if amount is zero', async () => {
        const amount = ethers.utils.parseEther('0');
        await expect(staker.lockVrsw(amount, '10')).to.revertedWith(
            'insufficient amount'
        );
    });

    it('lockVrsw fails if amount is zero', async () => {
        const amount = ethers.utils.parseEther('10');
        await expect(staker.lockVrsw(amount, '0')).to.revertedWith(
            'insufficient lock duration'
        );
    });

    it('lockStakedVrsw works', async () => {
        const amount = ethers.utils.parseEther('10');
        await staker.stakeVrsw(amount);
        const accountBalanceBefore = await vrsw.balanceOf(accounts[0].address);
        const contractBalanceBefore = await vrsw.balanceOf(staker.address);
        const muBefore = await staker.mu(accounts[0].address);
        const totalMuBefore = await staker.totalMu();
        const totalVrswBefore = await staker.totalVrswAvailable();
        const compoundRateGlobalBefore = await staker.compoundRateGlobal();
        const totalRewardPointsBefore = await staker.totalRewardPoints();
        await staker.lockStakedVrsw(amount.div(2), '1');
        const totalRewardPointsAfter = await staker.totalRewardPoints();
        const accountBalanceAfter = await vrsw.balanceOf(accounts[0].address);
        const contractBalanceAfter = await vrsw.balanceOf(staker.address);
        const compoundRateGlobalAfter = await staker.compoundRateGlobal();

        expect(accountBalanceAfter).to.be.equal(accountBalanceBefore);
        expect(contractBalanceAfter).to.be.equal(contractBalanceBefore);
        expect(await staker.mu(accounts[0].address)).to.above(muBefore);
        expect(await staker.totalMu()).to.above(totalMuBefore);
        expect(await staker.totalVrswAvailable()).to.be.above(totalVrswBefore);
        expect(await staker.compoundRateGlobal()).to.be.above(
            compoundRateGlobalBefore
        );
        expect(totalRewardPointsAfter).to.be.above(totalRewardPointsBefore);
        expect(await staker.rewardPoints(accounts[0].address)).to.be.equal(
            totalRewardPointsAfter
        );
        expect(await staker.compoundRate(accounts[0].address)).to.be.equal(
            compoundRateGlobalAfter
        );
        expect((await staker.stakes(accounts[0].address, 2)).amount).to.equal(
            amount.div(2)
        );
        expect((await staker.stakes(accounts[0].address, 0)).amount).to.equal(
            amount.div(2)
        );
    });

    it('lockStakedVrsw fails if amount is greater than unstaked', async () => {
        const amount = ethers.utils.parseEther('10');
        await expect(staker.lockStakedVrsw(amount, '1')).to.revertedWith(
            'insufficient amount'
        );
    });

    it('lockStakedVrsw fails if lock duration is zero', async () => {
        const amount = ethers.utils.parseEther('1');
        await expect(staker.lockStakedVrsw(amount, '0')).to.revertedWith(
            'insufficient lock duration'
        );
    });

    it('unlockVrsw works', async () => {
        const unlockedVrswBefore = (await staker.viewStakes())[0].amount;
        const contractBalanceBefore = await vrsw.balanceOf(staker.address);
        const muBefore = await staker.mu(accounts[0].address);
        const totalMuBefore = await staker.totalMu();
        const totalVrswBefore = await staker.totalVrswAvailable();
        const compoundRateGlobalBefore = await staker.compoundRateGlobal();
        const totalRewardPointsBefore = await staker.totalRewardPoints();
        expect(
            (await staker.checkLock(accounts[0].address)).toString()
        ).to.be.equal('2');
        const gVrswAccountBalanceBefore = await gVrsw.balanceOf(
            accounts[0].address
        );
        await staker.unlockVrsw(accounts[0].address, 2);
        const totalRewardPointsAfter = await staker.totalRewardPoints();
        const unlockedVrswAfter = (await staker.viewStakes())[0].amount;
        const contractBalanceAfter = await vrsw.balanceOf(staker.address);
        const compoundRateGlobalAfter = await staker.compoundRateGlobal();
        const gVrswAccountBalanceAfter = await gVrsw.balanceOf(
            accounts[0].address
        );

        expect(unlockedVrswAfter).to.be.above(unlockedVrswBefore);
        expect(gVrswAccountBalanceAfter).to.be.equal(gVrswAccountBalanceBefore);
        expect(contractBalanceAfter).to.be.equal(contractBalanceBefore);
        expect(await staker.mu(accounts[0].address)).to.below(muBefore);
        expect(await staker.totalMu()).to.below(totalMuBefore);
        expect(await staker.totalVrswAvailable()).to.be.above(totalVrswBefore);
        expect(await staker.compoundRateGlobal()).to.be.above(
            compoundRateGlobalBefore
        );
        expect(totalRewardPointsAfter).to.be.above(totalRewardPointsBefore);
        expect(await staker.rewardPoints(accounts[0].address)).to.be.equal(
            totalRewardPointsAfter
        );
        expect(await staker.compoundRate(accounts[0].address)).to.be.equal(
            compoundRateGlobalAfter
        );
        expect(await staker.checkLock(accounts[0].address)).to.be.an('array')
            .that.is.empty;
    });
});
