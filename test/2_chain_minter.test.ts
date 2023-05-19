import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { deployments, ethers } from 'hardhat';
import {
    Vrsw,
    GVrsw,
    VStakerFactory,
    VChainMinter,
    VGlobalMinter,
    VStaker,
    Token1,
    Token2,
} from '../typechain-types';
import { time } from '@nomicfoundation/hardhat-network-helpers';

describe('vChainMinter 1', function () {
    let stakerFactory: VStakerFactory;
    let minter: VChainMinter;
    let vrsw: Vrsw;
    let globalMinter: VGlobalMinter;
    let accounts: SignerWithAddress[];

    beforeEach(async () => {
        // init
        accounts = await ethers.getSigners();
        await deployments.fixture(['all']);
        minter = await ethers.getContract('chainMinter');
        stakerFactory = await ethers.getContract('stakerFactory');
        globalMinter = await ethers.getContract('globalMinter');

        vrsw = await ethers.getContractAt('Vrsw', await minter.vrsw());

        await vrsw.approve(minter.address, ethers.utils.parseEther('10000000'));

        // get tokens for the next epoch
        await globalMinter.nextEpochTransfer();

        await expect(
            minter.transferRewards(accounts[0].address, '1')
        ).to.revertedWith('too early');

        // skip time to emissionStart
        await time.setNextBlockTimestamp(
            ethers.BigNumber.from(await globalMinter.emissionStartTs()).add(60)
        );
    });

    it('triggerEpochTransition works', async () => {
        await time.setNextBlockTimestamp(
            ethers.BigNumber.from(await globalMinter.emissionStartTs()).sub(
                1000
            )
        );
        await minter.prepareForNextEpoch(100);
        await time.setNextBlockTimestamp(
            ethers.BigNumber.from(await globalMinter.emissionStartTs())
        );
        const epochStartTimeBefore = await minter.startEpochTime();
        await minter.triggerEpochTransition();
        const epochStartTimeAfter = await minter.startEpochTime();
        expect(epochStartTimeAfter).to.be.above(epochStartTimeBefore);
        expect(await minter.currentEpochBalance()).to.be.above(0);
    });

    it('triggerEpochTransition through multiple epochs works', async () => {
        await time.setNextBlockTimestamp(
            ethers.BigNumber.from(await globalMinter.emissionStartTs()).sub(
                1000
            )
        );
        await minter.prepareForNextEpoch(100);
        await time.setNextBlockTimestamp(
            ethers.BigNumber.from(await globalMinter.emissionStartTs())
        );
        await minter.triggerEpochTransition();
        await time.setNextBlockTimestamp(
            ethers.BigNumber.from(await time.latest())
                .add(await globalMinter.epochDuration())
                .sub(await globalMinter.epochPreparationTime())
        );
        await minter.prepareForNextEpoch(100);
        await time.setNextBlockTimestamp(
            ethers.BigNumber.from(await globalMinter.emissionStartTs())
                .add(ethers.BigNumber.from(await minter.epochDuration()))
                .mul(10)
        );
        const epochStartTimeBefore = await minter.startEpochTime();
        const epochBalanceBefore = await minter.startEpochSupply();
        await minter.triggerEpochTransition();
        const epochStartTimeAfter = await minter.startEpochTime();
        const epochBalanceAfter = await minter.startEpochSupply();
        expect(epochStartTimeAfter).to.be.above(epochStartTimeBefore);
        expect(epochBalanceAfter).to.be.above(epochBalanceBefore);
        expect(await minter.currentEpochBalance()).to.be.equal(0);
        expect(await minter.nextEpochBalance()).to.be.equal(0);
    });

    it("triggerEpochTransition fails when it's too early", async () => {
        await time.setNextBlockTimestamp(
            ethers.BigNumber.from(await globalMinter.emissionStartTs()).sub(
                1000
            )
        );
        await expect(minter.triggerEpochTransition()).to.revertedWith(
            'Too early'
        );
    });

    it('cannot deploy chainMinter with zero addresses', async () => {
        const minterFactory = await ethers.getContractFactory('VChainMinter');
        await expect(
            minterFactory.deploy(
                await time.latest(),
                ethers.constants.AddressZero,
                vrsw.address,
                vrsw.address
            )
        ).to.revertedWith('tokenomicsParams zero address');
        await expect(
            minterFactory.deploy(
                await time.latest(),
                vrsw.address,
                ethers.constants.AddressZero,
                vrsw.address
            )
        ).to.revertedWith('vrsw zero address');
        await expect(
            minterFactory.deploy(
                await time.latest(),
                vrsw.address,
                vrsw.address,
                ethers.constants.AddressZero
            )
        ).to.revertedWith('gVrsw zero address');
    });

    it('mintGVrsw fails when called with zero amount', async () => {
        await expect(
            minter.mintGVrsw(accounts[1].address, '0')
        ).to.revertedWith('zero amount');
    });

    it('mintGVrsw fails when called not by staker', async () => {
        await expect(minter.mintGVrsw(accounts[1].address, '1')).to.reverted;
    });

    it('burnGVrsw fails when called with zero amount', async () => {
        await expect(
            minter.burnGVrsw(accounts[1].address, '0')
        ).to.revertedWith('zero amount');
    });

    it('burnGVrsw fails when called not by staker', async () => {
        await expect(minter.burnGVrsw(accounts[1].address, '1')).to.reverted;
    });

    it('transferRewards fails when called not by staker', async () => {
        await expect(minter.transferRewards(accounts[1].address, '1')).to
            .reverted;
    });

    it('prepareForNextEpoch fails when is called not by owner', async () => {
        await expect(
            minter.connect(accounts[1]).prepareForNextEpoch('1')
        ).to.revertedWith('Ownable: caller is not the owner');
    });

    it('setStakerFactory fails when is called not by owner', async () => {
        await expect(
            minter.connect(accounts[1]).setStakerFactory(accounts[1].address)
        ).to.revertedWith('Ownable: caller is not the owner');
    });

    it('setStakerFactory fails when new staker address is zero', async () => {
        await expect(
            minter.setStakerFactory(ethers.constants.AddressZero)
        ).to.revertedWith('zero address');
    });

    it('setStakerFactory fails when trying to set stakerfactory second time', async () => {
        // already set in deploy script
        await expect(
            minter.setStakerFactory(accounts[1].address)
        ).to.revertedWith('staker factory can be set once');
    });

    it('setEpochParams fails when is called not by owner', async () => {
        await expect(
            minter.connect(accounts[1]).setEpochParams('1', '1')
        ).to.revertedWith('Ownable: caller is not the owner');
    });

    it('setEpochParams works', async () => {
        await minter.setEpochParams('1296000', '648000');
        expect(await minter.nextEpochPreparationTime()).to.be.equal(648000);
        expect(await minter.nextEpochDuration()).to.be.equal(1296000);
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

    it('prepareForNextEpoch works', async () => {
        await time.setNextBlockTimestamp(
            ethers.BigNumber.from(await globalMinter.emissionStartTs()).sub(
                1000
            )
        );
        // epoch #0
        const balanceBefore = await vrsw.balanceOf(accounts[0].address);
        await minter.prepareForNextEpoch(balanceBefore.div(2));
        const balanceAfter = await vrsw.balanceOf(accounts[0].address);
        expect(balanceAfter).to.be.below(balanceBefore);

        await minter.prepareForNextEpoch(balanceBefore.div(4));
        const balanceAfter2 = await vrsw.balanceOf(accounts[0].address);
        expect(balanceAfter2).to.be.above(balanceAfter);

        await minter.prepareForNextEpoch(balanceBefore.div(4));
        const balanceAfter3 = await vrsw.balanceOf(accounts[0].address);
        expect(balanceAfter3).to.be.equal(balanceAfter2);

        await time.setNextBlockTimestamp(
            ethers.BigNumber.from(await globalMinter.emissionStartTs())
        );

        await minter.triggerEpochTransition();

        // epoch #1
        await time.setNextBlockTimestamp(
            (await minter.emissionStartTs())
                .add(await minter.epochDuration())
                .sub(await minter.epochPreparationTime())
        );

        await vrsw.approve(minter.address, ethers.utils.parseEther('10000000'));

        await minter.prepareForNextEpoch(balanceAfter3);
        const balanceAfter4 = await vrsw.balanceOf(accounts[0].address);
        expect(balanceAfter4).to.be.below(balanceAfter3);
    });

    it("prepareForNextEpoch fails if it's not time for that", async () => {
        await expect(minter.prepareForNextEpoch('1')).to.revertedWith(
            'Too early'
        );
        await time.setNextBlockTimestamp(
            ethers.BigNumber.from(await globalMinter.emissionStartTs())
                .add(await globalMinter.epochDuration())
                .sub((await globalMinter.epochPreparationTime()) + 1)
        );
        await expect(minter.prepareForNextEpoch('1')).to.revertedWith(
            'Too early'
        );
    });
});

describe('vChainMinter: allocation points', function () {
    let stakerFactory: VStakerFactory;
    let token1: Token1;
    let token2: Token2;
    let staker1: VStaker;
    let staker2: VStaker;
    let staker3: VStaker;
    let minter: VChainMinter;
    let vrsw: Vrsw;
    let gVrsw: GVrsw;
    let globalMinter: VGlobalMinter;
    let accounts: SignerWithAddress[];

    before(async () => {
        // init
        accounts = await ethers.getSigners();
        await deployments.fixture(['all']);
        stakerFactory = await ethers.getContract('stakerFactory');
        minter = await ethers.getContract('chainMinter');
        globalMinter = await ethers.getContract('globalMinter');
        token1 = await ethers.getContract('Token1');
        token2 = await ethers.getContract('Token2');
        await stakerFactory.createPoolStaker(token1.address);
        await stakerFactory.createPoolStaker(token2.address);
        const staker1Addr = await stakerFactory.getVRSWPoolStaker();
        const staker2Addr = await stakerFactory.getPoolStaker(token1.address);
        const staker3Addr = await stakerFactory.getPoolStaker(token2.address);
        staker1 = await ethers.getContractAt('VStaker', staker1Addr);
        staker2 = await ethers.getContractAt('VStaker', staker2Addr);
        staker3 = await ethers.getContractAt('VStaker', staker3Addr);

        vrsw = await ethers.getContractAt('Vrsw', await minter.vrsw());
        gVrsw = await ethers.getContractAt('GVrsw', await minter.gVrsw());

        await vrsw.approve(minter.address, ethers.utils.parseEther('10000000'));

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
            ethers.BigNumber.from(await globalMinter.emissionStartTs()).add(60)
        );
    });

    it('setAllocationPoints works', async () => {
        // with epoch parameters changed

        await minter.setEpochParams('100', '50');

        await minter.setAllocationPoints(
            [staker1.address, staker2.address],
            ['10', '90']
        );
        const stake1 = await minter.stakers(staker1.address);
        const stake2 = await minter.stakers(staker2.address);
        const stake3 = await minter.stakers(staker3.address);
        expect(stake1.totalAllocated).to.be.equal('0');
        expect(stake1.lastUpdated).to.be.above('0');
        expect(stake2.totalAllocated).to.be.equal('0');
        expect(stake2.lastUpdated).to.be.above('0');
        expect(stake3.totalAllocated).to.be.equal('0');
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
        expect(stake1.lastUpdated).to.be.above('0');
        expect(stake2.totalAllocated).to.be.above('0');
        expect(stake2.lastUpdated).to.be.above('0');
        expect(stake3.totalAllocated).to.be.equal('0');
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

    it('setAllocationPoints fails when input lengths are differ', async () => {
        await expect(
            minter.setAllocationPoints(
                [staker1.address, staker2.address, staker3.address],
                ['0', '100']
            )
        ).to.revertedWith('lengths differ');
    });

    it('setAllocationPoints fails when sum is more than 100%', async () => {
        await expect(
            minter.setAllocationPoints(
                [staker1.address, staker2.address, staker3.address],
                ['50', '40', '30']
            )
        ).to.revertedWith('sum must be less than 100%');
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
