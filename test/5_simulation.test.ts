import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { deployments, ethers } from 'hardhat';
import { expect } from 'chai';
import {
    VeVrsw,
    Vrsw,
    VGlobalMinter,
    VChainMinter,
    VStaker,
    Token0,
} from '../typechain-types';
import { time, mine } from '@nomicfoundation/hardhat-network-helpers';

describe('Simulation', function () {
    const accountsNumber = 5;
    let vrsw: Vrsw;
    let veVrsw: VeVrsw;
    let globalMinter: VGlobalMinter;
    let minter: VChainMinter;
    let token0: Token0;
    let staker: VStaker;
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
        const balance = (await staker.vrswStakes(account.address, 0)).amount;
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
        const balance = (await staker.vrswStakes(account.address, 0)).amount;
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
        console.log(
            `${account.address} is staking ${amount} LP tokens TOKEN 0`
        );
        await staker
            .connect(account)
            .stakeLp(
                token0.address,
                ethers.utils.parseEther(amount.toString())
            );
    }

    async function unstakeLpRandom(
        account: SignerWithAddress,
        staker: VStaker
    ) {
        const balance = (
            await staker.lpStakes(
                account.address,
                await lpStakeIndex(account.address, token0.address)
            )
        ).amount;
        const amount = getRandom(1, Number(ethers.utils.formatEther(balance)));
        console.log(
            `${account.address} is unstaking ${amount} LP tokens TOKEN 0`
        );
        await staker
            .connect(account)
            .unstakeLp(
                token0.address,
                ethers.utils.parseEther(amount.toString())
            );
    }

    async function claimRewardsRandom0(
        account: SignerWithAddress,
        staker: VStaker
    ) {
        const balanceBefore = await vrsw.balanceOf(account.address);
        await staker
            .connect(account)
            .claimRewards(ethers.constants.AddressZero);
        const balanceAfter = await vrsw.balanceOf(account.address);
        console.log(
            `${account.address} is claiming ${balanceAfter
                .sub(balanceBefore)
                .toString()} rewards VRSW-only`
        );
    }
    async function claimRewardsRandom1(
        account: SignerWithAddress,
        staker: VStaker
    ) {
        const balanceBefore = await vrsw.balanceOf(account.address);
        await staker.connect(account).claimRewards(token0.address);
        const balanceAfter = await vrsw.balanceOf(account.address);
        console.log(
            `${account.address} is claiming ${balanceAfter
                .sub(balanceBefore)
                .toString()} rewards TOKEN 0`
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
                (await staker.connect(account).viewVrswStakes()).length <
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
                    (await staker.viewRewards(
                        account.address,
                        ethers.constants.AddressZero
                    )) ||
                        (await staker.viewRewards(
                            account.address,
                            ethers.constants.AddressZero
                        ))
                )
            )
        ) {
            actions.push(claimRewardsRandom0);
        }
        if (
            Number(
                ethers.utils.formatEther(
                    (await staker.viewRewards(
                        account.address,
                        token0.address
                    )) ||
                        (await staker.viewRewards(
                            account.address,
                            ethers.constants.AddressZero
                        ))
                )
            )
        ) {
            actions.push(claimRewardsRandom1);
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
        try {
            if (
                Number(
                    ethers.utils.formatEther(
                        (
                            await staker.lpStakes(
                                account.address,
                                await lpStakeIndex(
                                    account.address,
                                    token0.address
                                )
                            )
                        ).amount
                    )
                )
            ) {
                actions.push(unstakeLpRandom);
            }
        } catch (e) {}
        try {
            if (
                Number(
                    ethers.utils.formatEther(
                        (await staker.vrswStakes(account.address, 0)).amount
                    )
                )
            ) {
                actions.push(unstakeVrswRandom);
                if (
                    (await staker.connect(account).viewVrswStakes()).length <
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
        globalMinter = await ethers.getContract('globalMinter');
        vrsw = await ethers.getContractAt('Vrsw', await globalMinter.vrsw());
        minter = await ethers.getContract('chainMinter');
        staker = await ethers.getContract('staker');
        veVrsw = await ethers.getContractAt('VeVrsw', await minter.veVrsw());
        await vrsw.approve(
            minter.address,
            ethers.utils.parseEther('1000000000000000')
        );

        await minter.setAllocationPoints(
            [token0.address, ethers.constants.AddressZero],
            ['70', '30']
        );

        for (var acc of accounts.slice(1, accountsNumber + 1)) {
            await globalMinter.arbitraryTransfer(
                acc.address,
                ethers.utils.parseEther('25000000')
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
                .unstakeLp(
                    token0.address,
                    (
                        await staker.lpStakes(
                            account.address,
                            await staker.lpStakeIndex(
                                account.address,
                                token0.address
                            )
                        )
                    ).amount
                );
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
                .unstakeVrsw(
                    (
                        await staker.vrswStakes(account.address, 0)
                    ).amount
                );
            await claimRewardsRandom0(account, staker);
            await claimRewardsRandom1(account, staker);
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
        console.log(
            `LP balance of minter = ${await token0.balanceOf(minter.address)}`
        );
        console.log(
            `VRSW balance of minter = ${await vrsw.balanceOf(minter.address)}`
        );
        /*
        expect(
            finalVrswBalance
                .sub(ethers.utils.parseEther('25000000').mul(accountsNumber))
                .mul(10000)
                .div(ethers.utils.parseEther('500000000'))
        ).to.be.equal('6999');
        */
        expect(await token0.balanceOf(minter.address)).to.be.equal('0');
        // dust
        expect(await vrsw.balanceOf(minter.address)).to.be.lessThan(ethers.utils.parseEther('1'));
        expect(await token0.balanceOf(staker.address)).to.be.equal('0');
        expect(await vrsw.balanceOf(staker.address)).to.be.equal('0');
    });
});
