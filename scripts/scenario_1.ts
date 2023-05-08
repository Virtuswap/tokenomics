import { ethers, getNamedAccounts, network } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';

async function main() {
    // CHANGEME
    const pairs = [
        '0xb4e29bb3A1aaE7470c5d7FDcCAa8a9D6F547A209',
        '0x1501e9882b4ed239F98bdF1a0E47f29eB3222c39',
        '0x5C7BFAdef21062fceD065Ea2e8Ed5F37530A2Cc2',
    ];

    // the last one is VRSW-only staker
    // CHANGEME
    const allocationPoints = ['33', '33', '33', '1'];
    // CHANGEME
    const amountToStake = ['10', '10', '10', '10'].map(ethers.utils.parseEther);

    const chainId: number = network.config.chainId!;
    const { deployer } = await getNamedAccounts();

    const globalMinter = await ethers.getContract('globalMinter', deployer);
    console.log(`vGlobalMinter address: ${globalMinter.address}`);
    const chainMinter = await ethers.getContract('chainMinter', deployer);
    console.log(`vChainMinter address: ${chainMinter.address}`);
    const stakerFactory = await ethers.getContract('stakerFactory', deployer);
    console.log(`vStakerFactory address: ${stakerFactory.address}`);

    console.log('Creating stakers...');
    for (var pair of pairs) {
        try {
            await (await stakerFactory.createPoolStaker(pair)).wait();
        } catch (e: any) {
            if (e.message.toLowerCase().includes('staker exists')) {
                console.log(`staker for pool ${pair} already exists`);
            } else {
                console.log(e);
            }
        }
    }

    var stakers = [];
    for (var pair of pairs) {
        stakers.push(await stakerFactory.stakers(pair));
    }
    stakers.push(await stakerFactory.getVRSWPoolStaker());

    console.log(`Stakers: ${stakers}`);

    for (var staker of stakers) {
        console.log(
            `Initial rewards in ${staker} = ${await (
                await ethers.getContractAt('vStaker', staker)
            ).viewRewards(deployer)}`
        );
    }

    console.log('Setting allocation points...');
    await (
        await chainMinter.setAllocationPoints(stakers, allocationPoints)
    ).wait();

    if (chainId == 31337) {
        await time.increase(100);
    } else {
        var timestamp = 0;
        do {
            const blockNumBefore = await ethers.provider.getBlockNumber();
            const blockBefore = await ethers.provider.getBlock(blockNumBefore);
            timestamp = blockBefore.timestamp;
            process.stdout.write(
                `Current timestamp is ${timestamp}, emission starts at ${await globalMinter.emissionStartTs()}\r`
            );
        } while (timestamp < (await globalMinter.emissionStartTs()));
        console.log('');
    }

    console.log('Sending vrsw for testing...');
    await (
        await globalMinter.arbitraryTransfer(deployer, amountToStake.at(-1))
    ).wait();

    const erc20ABI = [
        'function approve(address spender, uint amount) returns (bool)',
    ];

    const signer = await ethers.getSigner(deployer);
    var index = 0;
    for (var stakerAddr of stakers.slice(0, -1)) {
        const staker = await ethers.getContractAt('vStaker', stakerAddr);
        console.log(
            `Staking ${amountToStake[index]} LP tokens to ${stakerAddr}`
        );
        try {
            const erc20 = new ethers.Contract(pairs[index], erc20ABI, signer);
            await (
                await erc20.approve(staker.address, amountToStake[index])
            ).wait();
            await (await staker.stakeLp(amountToStake[index])).wait();
        } catch (e: any) {
            if (e.message.toLowerCase().includes('too early')) {
                console.log(`VRSW minting hasn't started yet`);
            } else {
                console.log(e);
            }
            process.exitCode = 1;
        }
        ++index;
    }

    const vrswStaker = await ethers.getContractAt('vStaker', stakers.at(-1));
    console.log(
        `Staking ${amountToStake.at(-1)} VRSW tokens to ${stakers.at(-1)}`
    );
    try {
        const erc20 = new ethers.Contract(
            await globalMinter.vrsw(),
            erc20ABI,
            signer
        );
        await (
            await erc20.approve(vrswStaker.address, amountToStake.at(-1))
        ).wait();
        await (await vrswStaker.stakeVrsw(amountToStake.at(-1))).wait();
    } catch (e: any) {
        if (e.message.toLowerCase().includes('too early')) {
            console.log(`VRSW minting hasn't started yet`);
        } else {
            console.log(e);
        }
        process.exitCode = 1;
    }

    console.log('Sending vrsw for testing...');
    await (
        await globalMinter.arbitraryTransfer(deployer, amountToStake.at(-1))
    ).wait();

    console.log(
        `Locking ${amountToStake.at(-1)} VRSW tokens to ${stakers.at(-1)}`
    );
    try {
        const erc20 = new ethers.Contract(
            await globalMinter.vrsw(),
            erc20ABI,
            signer
        );
        await (
            await erc20.approve(vrswStaker.address, amountToStake.at(-1))
        ).wait();
        await (await vrswStaker.lockVrsw(amountToStake.at(-1), 5)).wait();
    } catch (e: any) {
        if (e.message.toLowerCase().includes('too early')) {
            console.log(`VRSW minting hasn't started yet`);
        } else {
            console.log(e);
        }
        process.exitCode = 1;
    }

    console.log(`Locking staked VRSW`);
    await (await vrswStaker.lockStakedVrsw(amountToStake.at(-1).div(2), 3)).wait();

    console.log(`Unlocking VRSW position #1...`);
    console.log(await vrswStaker.checkLock(deployer));
    await (await vrswStaker.unlockVrsw(deployer, 1));
    console.log(`Unlocking VRSW position #2...`);
    console.log(await vrswStaker.checkLock(deployer));
    await (await vrswStaker.unlockVrsw(deployer, 1));
    index = 0;
    for (var stakerAddr of stakers.slice(0, -1)) {
        const staker = await ethers.getContractAt('vStaker', stakerAddr);
        console.log(
            `Unstaking ${amountToStake[index]} LP tokens from ${stakerAddr}`
        );
        await (await staker.unstakeLp(amountToStake[index])).wait();
        ++index;
    }

    console.log(`unstaking vrsw`);
    await vrswStaker.unstakeVrsw(amountToStake.at(-1).div(4));
    console.log(`claiming rewards from VRSW staker`);
    await vrswStaker.claimRewards();
    index = 0;
    for (var stakerAddr of stakers.slice(0, -1)) {
        const staker = await ethers.getContractAt('vStaker', stakerAddr);
        console.log(
            `Claiming rewards from ${stakerAddr}`
        );
        await (await staker.claimRewards()).wait();
        ++index;
    }
    for (var staker of stakers) {
        console.log(
            `Rewards in ${staker} = ${await (
                await ethers.getContractAt('vStaker', staker)
            ).viewRewards(deployer)}`
        );
    }

    console.log('Done!');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
