import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect, assert } from 'chai';
import { deployments, ethers } from 'hardhat';
import {
    Vrsw,
    GVrsw,
    VStakerFactory,
    VStaker,
    VChainMinter,
    VGlobalMinter,
    Token0,
} from '../typechain-types';
import { time, mine } from '@nomicfoundation/hardhat-network-helpers';

describe('vStaker', function () {
    let stakerFactory: VStakerFactory;
    let vrsw: Vrsw;
    let gVrsw: GVrsw;
    let token0: Token0;
    let staker: VStaker;
    let accounts: SignerWithAddress[];
    let minter: VChainMinter;
    let globalMinter: VGlobalMinter;

    before(async () => {
        // init
        accounts = await ethers.getSigners();
        await deployments.fixture(['all']);
        stakerFactory = await ethers.getContract('stakerFactory');
        token0 = await ethers.getContract('Token0');
        minter = await ethers.getContract('chainMinter');
        globalMinter = await ethers.getContract('globalMinter');
        vrsw = await ethers.getContractAt('Vrsw', await minter.vrsw());
        gVrsw = await ethers.getContractAt('GVrsw', await minter.gVrsw());

        // create staker for token0
        await stakerFactory.createPoolStaker(token0.address);
        const stakerAddr = await stakerFactory.getPoolStaker(token0.address);
        staker = await ethers.getContractAt('vStaker', stakerAddr);

        // approve
        await token0.approve(staker.address, ethers.utils.parseEther('1000'));
        await vrsw.approve(staker.address, ethers.utils.parseEther('1000'));
        await vrsw.approve(minter.address, ethers.utils.parseEther('10000000'));

        // set allocation points for new staker and default staker
        await minter.setAllocationPoints(
            [staker.address, await stakerFactory.getVRSWPoolStaker()],
            ['70', '30']
        );

        // new chain minter deployed
        await globalMinter.addChainMinter();
        // get tokens for the next epoch
        await globalMinter.nextEpochTransfer();
        // transfer tokens for the next epoch to the chain minter
        await minter.prepareForNextEpoch(
            await vrsw.balanceOf(accounts[0].address)
        );
        await gVrsw.transfer(
            minter.address,
            ethers.utils.parseEther('1000000000')
        );

        // some functions should fail when they're called before emission start timestamp
        await expect(
            staker.stakeVrsw(ethers.utils.parseEther('10'))
        ).to.revertedWith('too early');
        await expect(
            staker.stakeLp(ethers.utils.parseEther('10'))
        ).to.revertedWith('too early');
        await expect(staker.claimRewards()).to.revertedWith('too early');
        await expect(
            staker.unstakeLp(ethers.utils.parseEther('10'))
        ).to.revertedWith('too early');
        await expect(
            staker.unstakeVrsw(ethers.utils.parseEther('10'))
        ).to.revertedWith('too early');
        await expect(
            staker.lockVrsw(ethers.utils.parseEther('10'), '1')
        ).to.revertedWith('too early');
        await expect(
            staker.lockStakedVrsw(ethers.utils.parseEther('10'), '1')
        ).to.revertedWith('too early');
        await expect(
            staker.unlockVrsw(accounts[0].address, '1')
        ).to.revertedWith('too early');

        // skip time to emissionStart
        await time.setNextBlockTimestamp(
            (await globalMinter.emissionStartTs()).add(60)
        );

        // get vrsw tokens for testing
        await globalMinter.arbitraryTransfer(
            accounts[0].address,
            ethers.utils.parseEther('1000')
        );
        await globalMinter.arbitraryTransfer(
            accounts[1].address,
            ethers.utils.parseEther('1000')
        );
    });

    it('claimRewards works if its nothing to claim', async () => {
        const accountBalanceBefore = await vrsw.balanceOf(accounts[0].address);
        const contractBalanceBefore = await vrsw.balanceOf(minter.address);
        const muBefore = await staker.mu(accounts[0].address);
        const totalMuBefore = await staker.totalMu();
        const totalVrswBefore = await staker.totalVrswAvailable();
        const compoundRateGlobalBefore = await staker.compoundRateGlobal();
        const totalRewardPointsBefore = await staker.totalRewardPoints();
        const rewardsBefore = await staker.viewRewards(accounts[0].address);
        await staker.claimRewards();
        const rewardsAfter = await staker.viewRewards(accounts[0].address);
        const totalRewardPointsAfter = await staker.totalRewardPoints();
        const accountBalanceAfter = await vrsw.balanceOf(accounts[0].address);
        const contractBalanceAfter = await vrsw.balanceOf(minter.address);
        const compoundRateGlobalAfter = await staker.compoundRateGlobal();

        expect(rewardsAfter).to.be.equal('0');
        expect(rewardsBefore).to.be.equal('0');
        expect(accountBalanceAfter).to.be.equal(accountBalanceBefore);
        expect(contractBalanceAfter).to.be.equal(contractBalanceBefore);
        expect(await staker.mu(accounts[0].address)).to.equal(muBefore);
        expect(await staker.totalMu()).to.equal(totalMuBefore);
        expect(await staker.totalVrswAvailable()).to.be.above(totalVrswBefore);
        expect(await staker.compoundRateGlobal()).to.be.above(
            compoundRateGlobalBefore
        );
        expect(totalRewardPointsAfter).to.be.equal(totalRewardPointsBefore);
        expect(await staker.rewardPoints(accounts[0].address)).to.be.equal(
            totalRewardPointsAfter
        );
        expect(await staker.compoundRate(accounts[0].address)).to.be.equal(
            compoundRateGlobalAfter
        );
    });

    it('lockStakedVrsw fails if there is no stakes', async () => {
        const amount = ethers.utils.parseEther('10');
        await expect(staker.lockStakedVrsw(amount, '1')).to.revertedWith(
            'no stakes'
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
        await expect(staker.stakeLp('0')).to.be.revertedWith('insufficient amount');
    });

    it('stakeLp fails if try to stake in VRSW-only pool', async () => {
        await expect(
            (
                await ethers.getContractAt(
                    'vStaker',
                    await stakerFactory.getVRSWPoolStaker()
                )
            ).stakeLp('1000')
        ).to.be.revertedWith('can stake only vrsw');
    });

    it('unstakeLp fails if try to unstake from VRSW-only pool', async () => {
        await expect(
            (
                await ethers.getContractAt(
                    'vStaker',
                    await stakerFactory.getVRSWPoolStaker()
                )
            ).unstakeLp('1000')
        ).to.be.revertedWith('can stake only vrsw');
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
            'not enough tokens'
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
        const rewardsBefore = await staker.viewRewards(accounts[0].address);
        await staker.claimRewards();
        const rewardsAfter = await staker.viewRewards(accounts[0].address);
        const totalRewardPointsAfter = await staker.totalRewardPoints();
        const accountBalanceAfter = await vrsw.balanceOf(accounts[0].address);
        const contractBalanceAfter = await vrsw.balanceOf(minter.address);
        const rewardsClaimed = await staker.rewardsClaimed(accounts[0].address);
        const compoundRateGlobalAfter = await staker.compoundRateGlobal();

        expect(rewardsAfter).to.be.equal('0');
        expect(rewardsBefore).to.be.above('0');
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

    it('stakeVrsw fails if amount is zero', async () => {
        const amount = ethers.utils.parseEther('0');
        await expect(staker.stakeVrsw(amount)).to.revertedWith(
            'insufficient amount'
        );
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
        await gVrsw.approve(
            minter.address,
            await gVrsw.balanceOf(accounts[0].address)
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
            'not enough tokens'
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
        await staker.lockVrsw(amount, '15');
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

    it('lockVrsw works when no other stakes', async () => {
        const amount = ethers.utils.parseEther('10');
        const accountBalanceBefore = await vrsw.balanceOf(accounts[1].address);
        const contractBalanceBefore = await vrsw.balanceOf(staker.address);
        const totalVrswBefore = await staker.totalVrswAvailable();
        const compoundRateGlobalBefore = await staker.compoundRateGlobal();
        const gVrswAccountBalanceBefore = await gVrsw.balanceOf(
            accounts[1].address
        );
        assert((await staker.connect(accounts[1]).viewStakes()).length === 0);
        await vrsw
            .connect(accounts[1])
            .approve(staker.address, ethers.utils.parseEther('1000'));
        await staker.connect(accounts[1]).lockVrsw(amount, '10');
        expect(
            (await staker.connect(accounts[1]).viewStakes()).length
        ).to.be.equal(2);
        const accountBalanceAfter = await vrsw.balanceOf(accounts[1].address);
        const contractBalanceAfter = await vrsw.balanceOf(staker.address);
        const compoundRateGlobalAfter = await staker.compoundRateGlobal();
        const gVrswAccountBalanceAfter = await gVrsw.balanceOf(
            accounts[1].address
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
        expect(await staker.totalVrswAvailable()).to.be.above(totalVrswBefore);
        expect(await staker.compoundRateGlobal()).to.be.above(
            compoundRateGlobalBefore
        );
        expect(await staker.compoundRate(accounts[1].address)).to.be.equal(
            compoundRateGlobalAfter
        );
        expect((await staker.stakes(accounts[1].address, 1)).amount).to.equal(
            amount
        );
        expect(await staker.checkLock(accounts[1].address)).to.be.an('array')
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
        await staker.lockStakedVrsw(amount.div(2), '5');
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
            'not enough tokens'
        );
    });

    it('lockStakedVrsw fails if lock duration is zero', async () => {
        const amount = ethers.utils.parseEther('1');
        await expect(staker.lockStakedVrsw(amount, '0')).to.revertedWith(
            'insufficient lock duration'
        );
    });

    it('unlockVrsw fails if position is still locked', async () => {
        await expect(staker.unlockVrsw(accounts[0].address, 1)).to.revertedWith(
            'locked'
        );
    });

    it('unlockVrsw works', async () => {
        await time.setNextBlockTimestamp((await time.latest()) + 2);
        await mine();
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

    it('unlockVrsw fails if position is zero', async () => {
        await expect(staker.unlockVrsw(accounts[0].address, 0)).to.revertedWith(
            'invalid position'
        );
    });
});

describe('vStakerFactory', function () {
    let stakerFactory: VStakerFactory;
    let vrsw: Vrsw;
    let gVrsw: GVrsw;
    let token0: Token0;
    let staker: VStaker;
    let accounts: SignerWithAddress[];
    let minter: VChainMinter;
    let globalMinter: VGlobalMinter;

    before(async () => {
        // init
        accounts = await ethers.getSigners();
        await deployments.fixture(['all']);
        stakerFactory = await ethers.getContract('stakerFactory');
        token0 = await ethers.getContract('Token0');
        minter = await ethers.getContract('chainMinter');
        globalMinter = await ethers.getContract('globalMinter');
        vrsw = await ethers.getContractAt('Vrsw', await minter.vrsw());
        gVrsw = await ethers.getContractAt('GVrsw', await minter.gVrsw());

        // create staker for token0
        await stakerFactory.createPoolStaker(token0.address);
        const stakerAddr = await stakerFactory.getPoolStaker(token0.address);
        staker = await ethers.getContractAt('vStaker', stakerAddr);

        // approve
        await token0.approve(staker.address, ethers.utils.parseEther('1000'));
        await vrsw.approve(staker.address, ethers.utils.parseEther('1000'));
        await vrsw.approve(minter.address, ethers.utils.parseEther('10000000'));

        // set allocation points for new staker and default staker
        await minter.setAllocationPoints(
            [staker.address, await stakerFactory.getVRSWPoolStaker()],
            ['70', '30']
        );

        // new chain minter deployed
        await globalMinter.addChainMinter();
        // get tokens for the next epoch
        await globalMinter.nextEpochTransfer();
        // transfer tokens for the next epoch to the chain minter
        await minter.prepareForNextEpoch(
            await vrsw.balanceOf(accounts[0].address)
        );
        await gVrsw.transfer(
            minter.address,
            ethers.utils.parseEther('1000000000')
        );

        // skip time to emissionStart
        await time.setNextBlockTimestamp(
            (await globalMinter.emissionStartTs()).add(60)
        );

        // get vrsw tokens for testing
        await globalMinter.arbitraryTransfer(
            accounts[0].address,
            ethers.utils.parseEther('1000')
        );
    });

    it('Only current admin can initiate admin rights transfer', async () => {
        assert((await stakerFactory.admin()) == accounts[0].address);
        await expect(
            stakerFactory
                .connect(accounts[1])
                .setPendingAdmin(accounts[1].address)
        ).to.revertedWith('OA');
    });

    it('Only pendingAdmin can accept admin rights', async () => {
        assert((await stakerFactory.admin()) == accounts[0].address);
        await expect(
            stakerFactory.connect(accounts[0]).acceptAdmin()
        ).to.revertedWith('Only for pending admin');
    });

    it('Should change admin', async () => {
        assert((await stakerFactory.admin()) == accounts[0].address);
        await stakerFactory.setPendingAdmin(accounts[0].address);
        expect((await stakerFactory.pendingAdmin()) == accounts[0].address);
        expect((await stakerFactory.admin()) == accounts[0].address);
        await stakerFactory.connect(accounts[0]).acceptAdmin();
        expect((await stakerFactory.pendingAdmin()) == '0');
        expect((await stakerFactory.admin()) == accounts[0].address);
    });

    it('Should not create staker when lp token is zero', async () => {
        await expect(
            stakerFactory.createPoolStaker(ethers.constants.AddressZero)
        ).to.revertedWith('zero address');
    });

    it('Should not create staker when staker exists', async () => {
        await expect(
            stakerFactory.createPoolStaker(token0.address)
        ).to.revertedWith('staker exists');
    });
});
