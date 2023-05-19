import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { deployments, ethers } from 'hardhat';
import { expect } from 'chai';
import {
    GVrsw,
    Vrsw,
    VGlobalMinter,
    VChainMinter,
    VStaker,
    Token0,
    VStakerFactory,
} from '../typechain-types';
import { time, mine } from '@nomicfoundation/hardhat-network-helpers';

describe('Simulation', function () {
    const accountsNumber = 2;
    let vrsw: Vrsw;
    let gVrsw: GVrsw;
    let token0: Token0;
    let globalMinter: VGlobalMinter;
    let minter: VChainMinter;
    let staker: VStaker;
    let vrswOnlyStaker: VStaker;
    let stakerFactory: VStakerFactory;
    let accounts: SignerWithAddress[];

    async function doNothingRandom(
        account: SignerWithAddress,
        staker: VStaker
    ) {
        console.log(`${account.address} is doing nothing`);
    }

    async function stakeVrswRandom(
        account: SignerWithAddress,
        staker: VStaker
    ) {
        const balance = await vrsw.balanceOf(account.address);
        const amount = getRandom(1, Number(ethers.utils.formatEther(balance)));
        console.log(`${account.address} is staking ${amount} VRSW`);
        await staker
            .connect(account)
            .stakeVrsw(ethers.utils.parseEther(amount.toString()));
    }

    async function unstakeVrswRandom(
        account: SignerWithAddress,
        staker: VStaker
    ) {
        const balance = (await staker.stakes(account.address, 0)).amount;
        const amount = getRandom(1, Number(ethers.utils.formatEther(balance)));
        console.log(`${account.address} is unstaking ${amount} VRSW`);
        await staker
            .connect(account)
            .unstakeVrsw(ethers.utils.parseEther(amount.toString()));
    }

    async function lockStakedVrswRandom(
        account: SignerWithAddress,
        staker: VStaker
    ) {
        const balance = (await staker.stakes(account.address, 0)).amount;
        const amount = getRandom(1, Number(ethers.utils.formatEther(balance)));
        const lockDuration = getRandom(
            1,
            87091200 -
                ((await time.latest()) - (await globalMinter.emissionStartTs()))
        );
        console.log(
            `${account.address} is locking ${amount} staked VRSW for ${lockDuration} seconds`
        );
        await staker
            .connect(account)
            .lockStakedVrsw(
                ethers.utils.parseEther(amount.toString()),
                lockDuration
            );
    }

    async function lockVrswRandom(account: SignerWithAddress, staker: VStaker) {
        const balance = await vrsw.balanceOf(account.address);
        const amount = getRandom(1, Number(ethers.utils.formatEther(balance)));
        const lockDuration = getRandom(
            1,
            87091200 -
                ((await time.latest()) - (await globalMinter.emissionStartTs()))
        );
        console.log(
            `${account.address} is locking ${amount} VRSW for ${lockDuration} seconds`
        );
        await staker
            .connect(account)
            .lockVrsw(ethers.utils.parseEther(amount.toString()), lockDuration);
    }

    async function stakeLpRandom(account: SignerWithAddress, staker: VStaker) {
        const balance = await token0.balanceOf(account.address);
        const amount = getRandom(1, Number(ethers.utils.formatEther(balance)));
        console.log(`${account.address} is staking ${amount} LP tokens`);
        await staker
            .connect(account)
            .stakeLp(ethers.utils.parseEther(amount.toString()));
    }

    async function unstakeLpRandom(
        account: SignerWithAddress,
        staker: VStaker
    ) {
        const balance = await staker.lpStake(account.address);
        const amount = getRandom(1, Number(ethers.utils.formatEther(balance)));
        console.log(`${account.address} is unstaking ${amount} LP tokens`);
        await staker
            .connect(account)
            .unstakeLp(ethers.utils.parseEther(amount.toString()));
    }

    async function claimRewardsRandom(
        account: SignerWithAddress,
        staker: VStaker
    ) {
        const balanceBefore = await vrsw.balanceOf(account.address);
        await staker.connect(account).claimRewards();
        const balanceAfter = await vrsw.balanceOf(account.address);
        console.log(
            `${account.address} is claiming ${balanceAfter
                .sub(balanceBefore)
                .toString()} rewards`
        );
    }

    async function unlockVrswRandom(
        account: SignerWithAddress,
        staker: VStaker
    ) {
        for (var acc of accounts.slice(1, accountsNumber + 1)) {
            const indices = await staker.checkLock(acc.address);
            if (indices.length > 0) {
                console.log(
                    `${account.address} is unlocking ${acc.address} staking position #${indices[0]}`
                );
                await staker
                    .connect(account)
                    .unlockVrsw(acc.address, indices[0]);
                break;
            }
        }
    }

    async function getAvailableActions(
        account: SignerWithAddress,
        staker: VStaker
    ) {
        var actions = [doNothingRandom];
        if (
            Number(
                ethers.utils.formatEther(await vrsw.balanceOf(account.address))
            )
        ) {
            actions.push(stakeVrswRandom);
            if (
                (await staker.connect(account).viewStakes()).length <
                    (await staker.STAKE_POSITIONS_LIMIT()).toNumber() &&
                (await time.latest()) - (await globalMinter.emissionStartTs()) <
                    87091200
            ) {
                actions.push(lockVrswRandom);
            }
        }
        if (
            Number(
                ethers.utils.formatEther(
                    await staker.viewRewards(account.address)
                )
            )
        ) {
            actions.push(claimRewardsRandom);
        }
        if (
            Number(
                ethers.utils.formatEther(
                    await token0.balanceOf(account.address)
                )
            )
        ) {
            actions.push(stakeLpRandom);
        }
        if (
            Number(
                ethers.utils.formatEther(await staker.lpStake(account.address))
            )
        ) {
            actions.push(unstakeLpRandom);
        }
        try {
            if (
                Number(
                    ethers.utils.formatEther(
                        (await staker.stakes(account.address, 0)).amount
                    )
                )
            ) {
                actions.push(unstakeVrswRandom);
                if (
                    (await staker.connect(account).viewStakes()).length <
                        (await staker.STAKE_POSITIONS_LIMIT()).toNumber() &&
                    (await time.latest()) -
                        (await globalMinter.emissionStartTs()) <
                        87091200
                ) {
                    actions.push(lockStakedVrswRandom);
                }
            }
        } catch (e) {}
        for (var acc of accounts.slice(1, accountsNumber + 1)) {
            const indices = await staker.checkLock(acc.address);
            if (indices.length > 0) {
                actions.push(unlockVrswRandom);
                break;
            }
        }
        return actions;
    }

    function getRandom(lowerBound: number, upperBound: number) {
        return (
            Math.floor(Math.random() * (upperBound - lowerBound)) + lowerBound
        );
    }

    beforeEach(async () => {
        accounts = await ethers.getSigners();
        await deployments.fixture(['all']);
        token0 = await ethers.getContract('Token0');
        stakerFactory = await ethers.getContract('stakerFactory');
        globalMinter = await ethers.getContract('globalMinter');
        vrsw = await ethers.getContractAt('Vrsw', await globalMinter.vrsw());
        gVrsw = await ethers.getContractAt('GVrsw', await globalMinter.gVrsw());
        minter = await ethers.getContract('chainMinter');

        await stakerFactory.createPoolStaker(token0.address);
        const stakerAddr = await stakerFactory.getPoolStaker(token0.address);
        staker = await ethers.getContractAt('VStaker', stakerAddr);
        vrswOnlyStaker = await ethers.getContractAt(
            'VStaker',
            await stakerFactory.getVRSWPoolStaker()
        );
        await vrsw.approve(
            minter.address,
            ethers.utils.parseEther('1000000000000000')
        );

        await minter.setAllocationPoints(
            [staker.address, await stakerFactory.getVRSWPoolStaker()],
            ['70', '30']
        );

        await globalMinter.addChainMinter();

        await gVrsw.transfer(
            minter.address,
            ethers.utils.parseEther('1000000000')
        );

        for (var acc of accounts.slice(1, accountsNumber + 1)) {
            await globalMinter.arbitraryTransfer(
                acc.address,
                ethers.utils.parseEther('25000000')
            );
            await gVrsw
                .connect(acc)
                .approve(
                    minter.address,
                    ethers.utils.parseEther('1000000000000000')
                );
        }
        await time.setNextBlockTimestamp(await globalMinter.emissionStartTs());
        await mine();
    });

    it('All rewards are distributed for staker with lp token', async () => {
        for (var acc of accounts.slice(1, accountsNumber + 1)) {
            await token0.mint(acc.address, ethers.utils.parseEther('50000000'));
            await token0
                .connect(acc)
                .approve(
                    staker.address,
                    ethers.utils.parseEther('1000000000000000')
                );
            await vrsw
                .connect(acc)
                .approve(
                    staker.address,
                    ethers.utils.parseEther('1000000000000000')
                );
        }
        const epochQuarter = ethers.BigNumber.from(
            await globalMinter.epochDuration()
        ).div(4);
        for (var account of accounts.slice(1, accountsNumber + 1)) {
            console.log(
                `VRSW balance of ${account.address} = ${await vrsw.balanceOf(
                    account.address
                )}`
            );
        }
        for (var account of accounts.slice(1, accountsNumber + 1)) {
            console.log(
                `LP balance of ${account.address} = ${await token0.balanceOf(
                    account.address
                )}`
            );
        }
        var totalTransferred = ethers.BigNumber.from(0);
        for (var k = 1; k <= 132; ++k) {
            console.log(`===== EPOCH #${k} =====`);
            await minter.triggerEpochTransition();
            const nextEpochStart = ethers.BigNumber.from(
                await globalMinter.emissionStartTs()
            ).add(k * (await globalMinter.epochDuration()));
            for (var i = 0; i < 3; ++i) {
                await time.setNextBlockTimestamp(
                    ethers.BigNumber.from(await time.latest()).add(
                        getRandom(0, epochQuarter.toNumber())
                    )
                );
                for (var account of accounts.slice(1, accountsNumber + 1)) {
                    const actions = await getAvailableActions(account, staker);
                    const randomAction = actions[getRandom(0, actions.length)];
                    await randomAction(account, staker);
                }
            }
            await time.setNextBlockTimestamp(nextEpochStart.sub(30));
            await globalMinter.nextEpochTransfer();
            console.log(
                `NextEpochTransfer amount = ${await vrsw.balanceOf(
                    accounts[0].address
                )}`
            );
            totalTransferred = totalTransferred.add(
                await vrsw.balanceOf(accounts[0].address)
            );
            await minter.prepareForNextEpoch(
                await vrsw.balanceOf(accounts[0].address)
            );
            await time.setNextBlockTimestamp(nextEpochStart);
            await mine();
        }
        for (var account of accounts.slice(1, accountsNumber + 1)) {
            await staker
                .connect(account)
                .unstakeLp(await staker.lpStake(account.address));
            while (true) {
                const indices = await staker.checkLock(account.address);
                if (indices.length > 0) {
                    console.log(
                        `${account.address} is unlocking ${account.address} staking position #${indices[0]}`
                    );
                    await staker
                        .connect(account)
                        .unlockVrsw(account.address, indices[0]);
                } else {
                    break;
                }
            }
            await staker
                .connect(account)
                .unstakeVrsw((await staker.stakes(account.address, 0)).amount);
            await claimRewardsRandom(account, staker);
        }
        expect(totalTransferred).to.be.equal(
            ethers.utils.parseEther('500000000')
        );
        var finalVrswBalance = ethers.BigNumber.from(0);
        for (var account of accounts.slice(1, accountsNumber + 1)) {
            const vrswBalance = await vrsw.balanceOf(account.address);
            console.log(`VRSW balance of ${account.address} = ${vrswBalance}`);
            finalVrswBalance = finalVrswBalance.add(vrswBalance);
            expect(vrswBalance).not.to.be.below(
                ethers.utils.parseEther('25000000')
            );
        }
        for (var account of accounts.slice(1, accountsNumber + 1)) {
            console.log(
                `LP balance of ${account.address} = ${await token0.balanceOf(
                    account.address
                )}`
            );
            expect(await token0.balanceOf(account.address)).to.be.equal(
                ethers.utils.parseEther('50000000')
            );
        }
        console.log(
            `LP balance of staker = ${await token0.balanceOf(staker.address)}`
        );
        console.log(
            `VRSW balance of staker = ${await vrsw.balanceOf(staker.address)}`
        );
        expect(
            finalVrswBalance
                .sub(ethers.utils.parseEther('25000000').mul(accountsNumber))
                .mul(10000)
                .div(ethers.utils.parseEther('500000000'))
        ).to.be.equal('6999');
        expect(await token0.balanceOf(staker.address)).to.be.equal('0');
        expect(await vrsw.balanceOf(staker.address)).to.be.equal('0');
    });

    it('All rewards are distributed for vrsw-only staker', async () => {
        for (var acc of accounts.slice(1, accountsNumber + 1)) {
            await vrsw
                .connect(acc)
                .approve(
                    vrswOnlyStaker.address,
                    ethers.utils.parseEther('1000000000000000')
                );
        }
        const epochQuarter = ethers.BigNumber.from(
            await globalMinter.epochDuration()
        ).div(4);
        for (var account of accounts.slice(1, accountsNumber + 1)) {
            console.log(
                `VRSW balance of ${account.address} = ${await vrsw.balanceOf(
                    account.address
                )}`
            );
        }
        var totalTransferred = ethers.BigNumber.from(0);
        for (var k = 1; k <= 132; ++k) {
            console.log(`===== EPOCH #${k} =====`);
            await minter.triggerEpochTransition();
            const nextEpochStart = ethers.BigNumber.from(
                await globalMinter.emissionStartTs()
            ).add(k * (await globalMinter.epochDuration()));
            for (var i = 0; i < 3; ++i) {
                await time.setNextBlockTimestamp(
                    ethers.BigNumber.from(await time.latest()).add(
                        getRandom(0, epochQuarter.toNumber())
                    )
                );
                for (var account of accounts.slice(1, accountsNumber + 1)) {
                    const actions = await getAvailableActions(
                        account,
                        vrswOnlyStaker
                    );
                    const randomAction = actions[getRandom(0, actions.length)];
                    await randomAction(account, vrswOnlyStaker);
                }
            }
            await time.setNextBlockTimestamp(nextEpochStart.sub(30));
            await globalMinter.nextEpochTransfer();
            console.log(
                `NextEpochTransfer amount = ${await vrsw.balanceOf(
                    accounts[0].address
                )}`
            );
            totalTransferred = totalTransferred.add(
                await vrsw.balanceOf(accounts[0].address)
            );
            await minter.prepareForNextEpoch(
                await vrsw.balanceOf(accounts[0].address)
            );
            await time.setNextBlockTimestamp(nextEpochStart);
            await mine();
        }
        for (var account of accounts.slice(1, accountsNumber + 1)) {
            while (true) {
                const indices = await vrswOnlyStaker.checkLock(account.address);
                if (indices.length > 0) {
                    console.log(
                        `${account.address} is unlocking ${account.address} staking position #${indices[0]}`
                    );
                    await vrswOnlyStaker
                        .connect(account)
                        .unlockVrsw(account.address, indices[0]);
                } else {
                    break;
                }
            }
            await vrswOnlyStaker
                .connect(account)
                .unstakeVrsw(
                    (
                        await vrswOnlyStaker.stakes(account.address, 0)
                    ).amount
                );
            await claimRewardsRandom(account, vrswOnlyStaker);
        }
        expect(totalTransferred).to.be.equal(
            ethers.utils.parseEther('500000000')
        );
        var finalVrswBalance = ethers.BigNumber.from(0);
        for (var account of accounts.slice(1, accountsNumber + 1)) {
            const vrswBalance = await vrsw.balanceOf(account.address);
            console.log(`VRSW balance of ${account.address} = ${vrswBalance}`);
            finalVrswBalance = finalVrswBalance.add(vrswBalance);
            expect(vrswBalance).not.to.be.below(
                ethers.utils.parseEther('25000000')
            );
        }
        console.log(
            `VRSW balance of staker = ${await vrsw.balanceOf(
                vrswOnlyStaker.address
            )}`
        );
        expect(
            finalVrswBalance
                .sub(ethers.utils.parseEther('25000000').mul(accountsNumber))
                .mul(10000)
                .div(ethers.utils.parseEther('500000000'))
        ).to.be.equal('2999');
        expect(await vrsw.balanceOf(vrswOnlyStaker.address)).to.be.equal('0');
    });
});
