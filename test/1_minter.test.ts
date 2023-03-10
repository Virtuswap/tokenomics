import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { deployments, ethers } from 'hardhat';
import {
    Vrsw,
    VStakerFactory,
    VMinter,
    VStaker,
    Token0,
    Token1,
    Token2,
} from '../typechain-types';
import { time } from '@nomicfoundation/hardhat-network-helpers';

describe('vMinter 1', function () {
    let stakerFactory: VStakerFactory;
    let vrsw: Vrsw;
    let minter: VMinter;
    let accounts: SignerWithAddress[];

    beforeEach(async () => {
        accounts = await ethers.getSigners();
        await deployments.fixture(['all']);
        stakerFactory = await ethers.getContract('stakerFactory');
        minter = await ethers.getContract('minter');
        vrsw = await ethers.getContract('vrswToken');
        await minter.setToken(vrsw.address);
        await minter.setStakerFactory(stakerFactory.address);
    });

    it('arbitraryTransfer works', async () => {
        const amount = ethers.utils.parseEther('10');
        const minterBalanceBefore = await vrsw.balanceOf(minter.address);
        const accountBalanceBefore = await vrsw.balanceOf(accounts[1].address);
        await minter.arbitraryTransfer(accounts[1].address, amount);
        const minterBalanceAfter = await vrsw.balanceOf(minter.address);
        const accountBalanceAfter = await vrsw.balanceOf(accounts[1].address);
        expect(minterBalanceAfter).to.be.equal(minterBalanceBefore.sub(amount));
        expect(accountBalanceAfter).to.be.equal(
            accountBalanceBefore.add(amount)
        );
    });

    it('arbitraryTransfer fails when amount is greater than unlockedBalance', async () => {
        const amount = (await minter.unlockedBalance()).add(
            ethers.utils.parseEther('10')
        );
        await expect(
            minter.arbitraryTransfer(accounts[1].address, amount)
        ).to.revertedWith('not enough unlocked tokens');
    });

    it('arbitraryTransfer fails when called not by owner', async () => {
        const amount = (await minter.unlockedBalance()).add(
            ethers.utils.parseEther('10')
        );
        await expect(
            minter
                .connect(accounts[1])
                .arbitraryTransfer(accounts[1].address, amount)
        ).to.revertedWith('Ownable: caller is not the owner');
    });

    it('newVesting fails when called not by owner', async () => {
        const amount = (await minter.unlockedBalance()).add(
            ethers.utils.parseEther('10')
        );
        await expect(
            minter
                .connect(accounts[1])
                .newVesting(
                    accounts[0].address,
                    await time.latest(),
                    100,
                    amount
                )
        ).to.revertedWith('Ownable: caller is not the owner');
    });

    it('newVesting fails when amount is greater than unlockedBalance', async () => {
        const amount = (await minter.unlockedBalance()).add(
            ethers.utils.parseEther('10')
        );
        await expect(
            minter.newVesting(
                accounts[0].address,
                await time.latest(),
                100,
                amount
            )
        ).to.revertedWith('not enough unlocked tokens');
    });

    it('newVesting works', async () => {
        const amount = ethers.utils.parseEther('10');
        const start = await time.latest();
        const minterBalanceBefore = await vrsw.balanceOf(minter.address);
        await minter.newVesting(accounts[1].address, start, 1, amount);
        const minterBalanceAfter = await vrsw.balanceOf(minter.address);
        const vestingWalletAddress = await minter.vestingWallets(0);
        const vVestingWalletFactory = await ethers.getContractFactory(
            'vVestingWallet'
        );
        const vestingWallet =
            vVestingWalletFactory.attach(vestingWalletAddress);
        expect(minterBalanceAfter).to.equal(minterBalanceBefore.sub(amount));
        expect(await vestingWallet.beneficiary()).to.equal(accounts[1].address);
        expect(await vestingWallet.start()).to.equal(start);
        expect(await vestingWallet.duration()).to.equal('1');
        expect(await vestingWallet.released()).to.equal('0');
        expect(await vestingWallet.releasable()).to.equal(amount);
        const accountBalanceBefore = await vrsw.balanceOf(accounts[1].address);
        await vestingWallet.release();
        const accountBalanceAfter = await vrsw.balanceOf(accounts[1].address);
        expect(accountBalanceAfter).to.equal(accountBalanceBefore.add(amount));
    });
});

describe('vMinter: allocation points', function () {
    let stakerFactory: VStakerFactory;
    let vrsw: Vrsw;
    let token0: Token0;
    let token1: Token1;
    let token2: Token2;
    let staker1: VStaker;
    let staker2: VStaker;
    let staker3: VStaker;
    let minter: VMinter;
    let accounts: SignerWithAddress[];

    before(async () => {
        accounts = await ethers.getSigners();
        await deployments.fixture(['all']);
        stakerFactory = await ethers.getContract('stakerFactory');
        minter = await ethers.getContract('minter');
        vrsw = await ethers.getContract('vrswToken');
        token0 = await ethers.getContract('Token0');
        token1 = await ethers.getContract('Token1');
        token2 = await ethers.getContract('Token2');
        await stakerFactory.createPoolStaker(token0.address);
        await stakerFactory.createPoolStaker(token1.address);
        await stakerFactory.createPoolStaker(token2.address);
        const staker1Addr = await stakerFactory.getPoolStaker(token0.address);
        const staker2Addr = await stakerFactory.getPoolStaker(token1.address);
        const staker3Addr = await stakerFactory.getPoolStaker(token2.address);
        staker1 = await ethers.getContractAt('vStaker', staker1Addr);
        staker2 = await ethers.getContractAt('vStaker', staker2Addr);
        staker3 = await ethers.getContractAt('vStaker', staker3Addr);
        await minter.setToken(vrsw.address);
        await minter.setStakerFactory(stakerFactory.address);
    });

    it('setAllocationPoints works', async () => {
        await minter.setAllocationPoints(
            [staker1.address, staker2.address],
            ['10', '90']
        );
        expect(await minter.totalAllocationPoints()).to.equal('100');
        const stake1 = await minter.stakers(staker1.address);
        const stake2 = await minter.stakers(staker2.address);
        const stake3 = await minter.stakers(staker3.address);
        expect(stake1.totalAllocated).to.be.equal('0');
        expect(stake1.totalTransferred).to.be.equal('0');
        expect(stake1.totalCompoundRate).to.be.equal('0');
        expect(stake1.lastUpdated).to.be.above('0');
        expect(stake2.totalAllocated).to.be.equal('0');
        expect(stake2.totalTransferred).to.be.equal('0');
        expect(stake2.totalCompoundRate).to.be.equal('0');
        expect(stake2.lastUpdated).to.be.above('0');
        expect(stake3.totalAllocated).to.be.equal('0');
        expect(stake3.totalTransferred).to.be.equal('0');
        expect(stake3.totalCompoundRate).to.be.equal('0');
        expect(stake3.lastUpdated).to.be.equal('0');
        const allocationPoints1 = await minter.allocationPoints(
            staker1.address
        );
        const allocationPoints2 = await minter.allocationPoints(
            staker2.address
        );
        const allocationPoints3 = await minter.allocationPoints(
            staker3.address
        );
        expect(allocationPoints1).to.be.equal('10');
        expect(allocationPoints2).to.be.equal('90');
        expect(allocationPoints3).to.be.equal('0');
    });

    it('setAllocationPoints updates state', async () => {
        await time.setNextBlockTimestamp((await time.latest()) + 10);
        await minter.setAllocationPoints(
            [staker1.address, staker2.address, staker3.address],
            ['0', '0', '100']
        );
        const stake1 = await minter.stakers(staker1.address);
        const stake2 = await minter.stakers(staker2.address);
        const stake3 = await minter.stakers(staker3.address);
        expect(stake1.totalAllocated).to.be.above('0');
        expect(stake1.totalTransferred).to.be.equal('0');
        expect(stake1.totalCompoundRate).to.be.above('0');
        expect(stake1.lastUpdated).to.be.above('0');
        expect(stake2.totalAllocated).to.be.above('0');
        expect(stake2.totalTransferred).to.be.equal('0');
        expect(stake2.totalCompoundRate).to.be.above('0');
        expect(stake2.lastUpdated).to.be.above('0');
        expect(stake3.totalAllocated).to.be.equal('0');
        expect(stake3.totalTransferred).to.be.equal('0');
        expect(stake3.totalCompoundRate).to.be.equal('0');
        expect(stake3.lastUpdated).to.be.above('0');
        const allocationPoints1 = await minter.allocationPoints(
            staker1.address
        );
        const allocationPoints2 = await minter.allocationPoints(
            staker2.address
        );
        const allocationPoints3 = await minter.allocationPoints(
            staker3.address
        );
        expect(allocationPoints1).to.be.equal('0');
        expect(allocationPoints2).to.be.equal('0');
        expect(allocationPoints3).to.be.equal('100');
    });

    it('setAllocationPoints fails when is called not by owner', async () => {
        await expect(
            minter
                .connect(accounts[1])
                .setAllocationPoints(
                    [staker1.address, staker2.address, staker3.address],
                    ['0', '0', '100']
                )
        ).to.revertedWith('Ownable: caller is not the owner');
    });

    it('setAllocationPoints fails when total allocation points are more than 100%', async () => {
        await expect(
            minter.setAllocationPoints(
                [staker1.address, staker2.address, staker3.address],
                ['50', '40', '11']
            )
        ).to.revertedWith('total allocation points > 100%');
    });

    it('setAllocationPoints fails when called not for staker', async () => {
        await expect(
            minter.setAllocationPoints(
                [accounts[1].address, staker2.address, staker3.address],
                ['50', '40', '10']
            )
        ).to.reverted;
    });
});
