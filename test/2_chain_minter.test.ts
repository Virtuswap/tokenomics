import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { deployments, ethers } from 'hardhat';
import {
    Vrsw,
    VeVrsw,
    VChainMinter,
    VGlobalMinter,
    VStaker,
    Token0,
    Token1,
} from '../typechain-types';
import { time, mine } from '@nomicfoundation/hardhat-network-helpers';

describe('vChainMinter 1', function () {
    let staker: VStaker;
    let minter: VChainMinter;
    let vrsw: Vrsw;
    let token0: Token0;
    let partnerToken: Token1;
    let globalMinter: VGlobalMinter;
    let accounts: SignerWithAddress[];

    beforeEach(async () => {
        // init
        accounts = await ethers.getSigners();
        await deployments.fixture(['all']);
        minter = await ethers.getContract('chainMinter');
        staker = await ethers.getContract('staker');
        token0 = await ethers.getContract('Token0');
        partnerToken = await ethers.getContract('Token1');
        globalMinter = await ethers.getContract('globalMinter');

        vrsw = await ethers.getContractAt('Vrsw', await minter.vrsw());

        await vrsw.approve(minter.address, ethers.utils.parseEther('10000000'));
        await partnerToken.approve(
            minter.address,
            ethers.utils.parseEther('10000000')
        );

        // get tokens for the next epoch
        await globalMinter.nextEpochTransfer();

        await expect(
            minter.transferRewards(
                accounts[0].address,
                token0.address,
                [vrsw.address],
                ['1']
            )
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
                true
            )
        ).to.revertedWith('tokenomicsParams zero address');
        await expect(
            minterFactory.deploy(
                await time.latest(),
                vrsw.address,
                ethers.constants.AddressZero,
                true
            )
        ).to.revertedWith('vrsw zero address');
    });

    it('mintVeVrsw fails when called with zero amount', async () => {
        await expect(
            minter.mintVeVrsw(accounts[1].address, '0')
        ).to.revertedWith('zero amount');
    });

    it('mintVeVrsw fails when called not by staker', async () => {
        await expect(minter.mintVeVrsw(accounts[1].address, '1')).to.reverted;
    });

    it('burnVeVrsw fails when called with zero amount', async () => {
        await expect(
            minter.burnVeVrsw(accounts[1].address, '0')
        ).to.revertedWith('zero amount');
    });

    it('burnVeVrsw fails when called not by staker', async () => {
        await expect(minter.burnVeVrsw(accounts[1].address, '1')).to.reverted;
    });

    it('transferRewards fails when called not by staker', async () => {
        await expect(
            minter.transferRewards(
                accounts[1].address,
                token0.address,
                [vrsw.address],
                ['1']
            )
        ).to.reverted;
    });

    it('prepareForNextEpoch fails when is called not by owner', async () => {
        await expect(
            minter.connect(accounts[1]).prepareForNextEpoch('1')
        ).to.revertedWith('Ownable: caller is not the owner');
    });

    it('setStaker fails when is called not by owner', async () => {
        await expect(
            minter.connect(accounts[1]).setStaker(accounts[1].address)
        ).to.revertedWith('Ownable: caller is not the owner');
    });

    it('setStaker fails when new staker address is zero', async () => {
        await expect(
            minter.setStaker(ethers.constants.AddressZero)
        ).to.revertedWith('zero address');
    });

    it('setStaker fails when trying to set staker second time', async () => {
        // already set in deploy script
        await expect(minter.setStaker(accounts[1].address)).to.revertedWith(
            'staker can be set once'
        );
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

    it('distributePartnerToken works', async () => {
        const amount = ethers.utils.parseEther('1000');
        await mine();
        const start = (await time.latest()) + 3;
        const partnerTokensBefore = await minter.getRewardTokens(
            token0.address
        );
        const partnerTokensInfoBefore = await minter.partnerTokensInfo(
            token0.address,
            partnerToken.address
        );
        const balanceBefore = await partnerToken.balanceOf(accounts[0].address);
        await minter.distributePartnerToken(
            partnerToken.address,
            amount,
            token0.address,
            start,
            1000
        );
        const balanceAfter = await partnerToken.balanceOf(accounts[0].address);
        const partnerTokensAfter = await minter.getRewardTokens(token0.address);
        const partnerTokensInfoAfter = await minter.partnerTokensInfo(
            token0.address,
            partnerToken.address
        );
        expect(partnerTokensBefore[0]).to.be.equal(vrsw.address);
        expect(partnerTokensAfter[0]).to.be.equal(vrsw.address);
        expect(partnerTokensAfter[1]).to.be.equal(partnerToken.address);
        expect(partnerTokensAfter.length).to.be.equal(2);
        expect(balanceAfter).to.be.equal(balanceBefore.sub(amount));
        expect(partnerTokensInfoBefore.from).to.be.equal('0');
        expect(partnerTokensInfoBefore.duration).to.be.equal('0');
        expect(partnerTokensInfoBefore.amount).to.be.equal('0');
        expect(partnerTokensInfoBefore.distributedAmount).to.be.equal('0');
        expect(partnerTokensInfoAfter.from).to.be.equal(start);
        expect(partnerTokensInfoAfter.duration).to.be.equal(1000);
        expect(partnerTokensInfoAfter.amount).to.be.equal(amount);
        expect(partnerTokensInfoAfter.distributedAmount).to.be.equal('0');

        expect(await time.latest()).to.be.lessThan(start);
        expect(
            await minter.calculateTokensForPool(
                token0.address,
                partnerToken.address
            )
        ).to.be.equal('0');
        await time.setNextBlockTimestamp(start + 1);
        await mine();
        expect(
            await minter.calculateTokensForPool(
                token0.address,
                partnerToken.address
            )
        ).to.be.equal(ethers.utils.parseEther('1'));
        await time.setNextBlockTimestamp(start + 1000);
        await mine();
        expect(
            await minter.calculateTokensForPool(
                token0.address,
                partnerToken.address
            )
        ).to.be.equal(ethers.utils.parseEther('1000'));
        await time.setNextBlockTimestamp(start + 2000);
        await mine();
        expect(
            await minter.calculateTokensForPool(
                token0.address,
                partnerToken.address
            )
        ).to.be.equal(ethers.utils.parseEther('1000'));

        const partnerTokensBefore2 = await minter.getRewardTokens(
            token0.address
        );
        const partnerTokensInfoBefore2 = await minter.partnerTokensInfo(
            token0.address,
            partnerToken.address
        );
        await minter.distributePartnerToken(
            partnerToken.address,
            amount,
            token0.address,
            start + 3000,
            1000
        );
        const partnerTokensAfter2 = await minter.getRewardTokens(
            token0.address
        );
        const partnerTokensInfoAfter2 = await minter.partnerTokensInfo(
            token0.address,
            partnerToken.address
        );
        expect(partnerTokensBefore2[0]).to.be.equal(vrsw.address);
        expect(partnerTokensBefore2[1]).to.be.equal(partnerToken.address);
        expect(partnerTokensBefore2.length).to.be.equal(2);
        expect(partnerTokensAfter2[0]).to.be.equal(vrsw.address);
        expect(partnerTokensAfter2[1]).to.be.equal(partnerToken.address);
        expect(partnerTokensAfter2.length).to.be.equal(2);
        expect(partnerTokensInfoBefore2.from).to.be.equal(start);
        expect(partnerTokensInfoBefore2.duration).to.be.equal(1000);
        expect(partnerTokensInfoBefore2.amount).to.be.equal(amount);
        expect(partnerTokensInfoBefore2.distributedAmount).to.be.equal('0');
        expect(partnerTokensInfoAfter2.from).to.be.equal(start + 3000);
        expect(partnerTokensInfoAfter2.duration).to.be.equal(1000);
        expect(partnerTokensInfoAfter2.amount).to.be.equal(amount);
        expect(partnerTokensInfoAfter2.distributedAmount).to.be.equal(amount);

        expect(await time.latest()).to.be.lessThan(start + 3000);
        expect(
            await minter.calculateTokensForPool(
                token0.address,
                partnerToken.address
            )
        ).to.be.equal(amount);
        await time.setNextBlockTimestamp(start + 3001);
        await mine();
        expect(
            await minter.calculateTokensForPool(
                token0.address,
                partnerToken.address
            )
        ).to.be.equal(ethers.utils.parseEther('1001'));
        await time.setNextBlockTimestamp(start + 4000);
        await mine();
        expect(
            await minter.calculateTokensForPool(
                token0.address,
                partnerToken.address
            )
        ).to.be.equal(ethers.utils.parseEther('2000'));
        await time.setNextBlockTimestamp(start + 5000);
        await mine();
        expect(
            await minter.calculateTokensForPool(
                token0.address,
                partnerToken.address
            )
        ).to.be.equal(ethers.utils.parseEther('2000'));
    });

    it('distributePartnerToken should fail if amount is zero', async () => {
        const start = (await time.latest()) + 3;
        await expect(
            minter.distributePartnerToken(
                partnerToken.address,
                '0',
                token0.address,
                start,
                1000
            )
        ).to.revertedWith('amount must be positive');
    });

    it('distributePartnerToken should fail if called by non-owner', async () => {
        const start = (await time.latest()) + 3;
        await expect(
            minter
                .connect(accounts[1])
                .distributePartnerToken(
                    partnerToken.address,
                    '100',
                    token0.address,
                    start,
                    1000
                )
        ).to.revertedWith('Ownable: caller is not the owner');
    });

    it('distributePartnerToken should fail if duration is zero', async () => {
        const amount = ethers.utils.parseEther('1000');
        const start = (await time.latest()) + 3;
        await expect(
            minter.distributePartnerToken(
                partnerToken.address,
                amount,
                token0.address,
                start,
                0
            )
        ).to.revertedWith('duration must be positive');
    });

    it('distributePartnerToken should fail if pool is invalid', async () => {
        const amount = ethers.utils.parseEther('1000');
        const start = (await time.latest()) + 3;
        await expect(
            minter.distributePartnerToken(
                partnerToken.address,
                amount,
                vrsw.address,
                start,
                1
            )
        ).to.reverted;
    });
});

describe('vChainMinter: allocation points', function () {
    let staker: VStaker;
    let token0: Token0;
    let token1: Token1;
    let minter: VChainMinter;
    let vrsw: Vrsw;
    let veVrsw: VeVrsw;
    let globalMinter: VGlobalMinter;
    let accounts: SignerWithAddress[];
    let staker1Addr: string;
    let staker2Addr: string;
    let staker3Addr: string;

    before(async () => {
        // init
        accounts = await ethers.getSigners();
        await deployments.fixture(['all']);
        staker = await ethers.getContract('staker');
        minter = await ethers.getContract('chainMinter');
        globalMinter = await ethers.getContract('globalMinter');
        token0 = await ethers.getContract('Token0');
        token1 = await ethers.getContract('Token1');
        staker1Addr = token0.address;
        staker2Addr = token1.address;
        staker3Addr = ethers.constants.AddressZero;

        vrsw = await ethers.getContractAt('Vrsw', await minter.vrsw());
        veVrsw = await ethers.getContractAt('VeVrsw', await minter.veVrsw());

        await vrsw.approve(minter.address, ethers.utils.parseEther('10000000'));

        // get tokens for the next epoch
        await globalMinter.nextEpochTransfer();
        // transfer tokens for the next epoch to the chain minter
        await minter.prepareForNextEpoch(
            await vrsw.balanceOf(accounts[0].address)
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
            [staker1Addr, staker2Addr],
            ['10', '90']
        );
        const stake1 = await minter.stakers(staker1Addr);
        const stake2 = await minter.stakers(staker2Addr);
        const stake3 = await minter.stakers(staker3Addr);
        expect(stake1.totalAllocated).to.be.equal('0');
        expect(stake1.lastUpdated).to.be.above('0');
        expect(stake2.totalAllocated).to.be.equal('0');
        expect(stake2.lastUpdated).to.be.above('0');
        expect(stake3.totalAllocated).to.be.equal('0');
        expect(stake3.lastUpdated).to.be.equal('0');
        const allocationPoints1 = await minter.allocationPoints(staker1Addr);
        const allocationPoints2 = await minter.allocationPoints(staker2Addr);
        const allocationPoints3 = await minter.allocationPoints(staker3Addr);
        expect(allocationPoints1).to.be.equal('10');
        expect(allocationPoints2).to.be.equal('90');
        expect(allocationPoints3).to.be.equal('0');
    });

    it('setAllocationPoints updates state', async () => {
        await time.setNextBlockTimestamp((await time.latest()) + 10);
        await minter.setAllocationPoints(
            [staker1Addr, staker2Addr, staker3Addr],
            ['0', '0', '100']
        );
        const stake1 = await minter.stakers(staker1Addr);
        const stake2 = await minter.stakers(staker2Addr);
        const stake3 = await minter.stakers(staker3Addr);
        expect(stake1.totalAllocated).to.be.above('0');
        expect(stake1.lastUpdated).to.be.above('0');
        expect(stake2.totalAllocated).to.be.above('0');
        expect(stake2.lastUpdated).to.be.above('0');
        expect(stake3.totalAllocated).to.be.equal('0');
        expect(stake3.lastUpdated).to.be.above('0');
        const allocationPoints1 = await minter.allocationPoints(staker1Addr);
        const allocationPoints2 = await minter.allocationPoints(staker2Addr);
        const allocationPoints3 = await minter.allocationPoints(staker3Addr);
        expect(allocationPoints1).to.be.equal('0');
        expect(allocationPoints2).to.be.equal('0');
        expect(allocationPoints3).to.be.equal('100');
    });

    it('setAllocationPoints fails when is called not by owner', async () => {
        await expect(
            minter
                .connect(accounts[1])
                .setAllocationPoints(
                    [staker1Addr, staker2Addr, staker3Addr],
                    ['0', '0', '100']
                )
        ).to.revertedWith('Ownable: caller is not the owner');
    });

    it('setAllocationPoints fails when input lengths are differ', async () => {
        await expect(
            minter.setAllocationPoints(
                [staker1Addr, staker2Addr, staker3Addr],
                ['0', '100']
            )
        ).to.revertedWith('lengths differ');
    });

    it('setAllocationPoints fails when sum is more than 1000000', async () => {
        await expect(
            minter.setAllocationPoints(
                [staker1Addr, staker2Addr, staker3Addr],
                ['500000', '400000', '300000']
            )
        ).to.revertedWith('sum must be less than 1000000');
    });

    it('setAllocationPoints fails when called not for staker', async () => {
        await expect(
            minter.setAllocationPoints(
                [accounts[1].address, staker2Addr, staker3Addr],
                ['50', '40', '10']
            )
        ).to.reverted;
    });
});
