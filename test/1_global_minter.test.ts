import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { deployments, ethers } from 'hardhat';
import { GVrsw, Vrsw, VGlobalMinter } from '../typechain-types';
import { time } from '@nomicfoundation/hardhat-network-helpers';

describe('vGlobalMinter 1', function () {
    let vrsw: Vrsw;
    let gVrsw: GVrsw;
    let minter: VGlobalMinter;
    let accounts: SignerWithAddress[];

    beforeEach(async () => {
        // init
        accounts = await ethers.getSigners();
        await deployments.fixture(['all']);
        minter = await ethers.getContract('globalMinter');
        vrsw = await ethers.getContractAt('Vrsw', await minter.vrsw());
        gVrsw = await ethers.getContractAt('GVrsw', await minter.gVrsw());

        // skip time to emissionStart
        await time.setNextBlockTimestamp(
            (await minter.emissionStartTs()).add(60)
        );
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

    it('addChainMinter works', async () => {
        const balanceBefore = await gVrsw.balanceOf(accounts[0].address);
        await minter.addChainMinter();
        const balanceAfter = await gVrsw.balanceOf(accounts[0].address);
        expect(balanceBefore).to.be.equal('0');
        expect(balanceAfter).to.be.equal(ethers.utils.parseEther('1000000000'));
    });

    it('setEpochParams works', async () => {
        await minter.setEpochParams('1296000', '648000');
        expect(await minter.nextEpochPreparationTime()).to.be.equal('648000');
        expect(await minter.nextEpochDuration()).to.be.equal('1296000');
    });

    it('setEpochParams fails when preparation time is more than epoch duration', async () => {
        await expect(minter.setEpochParams('2', '3')).to.revertedWith(
            'preparationTime >= epochDuration'
        );
    });

    it('setEpochParams fails when preparation time or epoch duration are zero', async () => {
        await expect(minter.setEpochParams('0', '0')).to.revertedWith(
            'must be greater than zero'
        );
        await expect(minter.setEpochParams('2', '0')).to.revertedWith(
            'must be greater than zero'
        );
    });
});

describe('vGlobalMinter 2', function () {
    let vrsw: Vrsw;
    let gVrsw: GVrsw;
    let minter: VGlobalMinter;
    let accounts: SignerWithAddress[];

    beforeEach(async () => {
        // init
        accounts = await ethers.getSigners();
        await deployments.fixture(['all']);
        minter = await ethers.getContract('globalMinter');
        vrsw = await ethers.getContractAt('Vrsw', await minter.vrsw());
        gVrsw = await ethers.getContractAt('GVrsw', await minter.gVrsw());
    });

    it('nextEpochTransfer works', async () => {
        // epoch #0
        const balanceBefore = await vrsw.balanceOf(accounts[0].address);
        await minter.nextEpochTransfer();
        const balanceAfter = await vrsw.balanceOf(accounts[0].address);
        expect(balanceAfter).to.be.above(balanceBefore);

        // epoch #1
        await time.setNextBlockTimestamp(
            (
                await minter.emissionStartTs()
            ).add(
                (
                    await minter.epochDuration()
                ).sub(await minter.epochPreparationTime())
            )
        );
        await minter.nextEpochTransfer();
        const balanceAfter2 = await vrsw.balanceOf(accounts[0].address);
        expect(balanceAfter2).to.be.above(balanceAfter);
        expect(balanceAfter2.sub(balanceAfter)).to.be.below(
            balanceAfter.sub(balanceBefore)
        );
    });

    it('nextEpochTransfer fails when its not preparation time', async () => {
        await time.setNextBlockTimestamp(await minter.emissionStartTs());
        await expect(minter.nextEpochTransfer()).to.revertedWith('Too early');
    });
});
