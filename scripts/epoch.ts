import { ethers, getNamedAccounts } from 'hardhat';

async function main() {
    const { deployer } = await getNamedAccounts();
    const globalMinter = await ethers.getContract('globalMinter', deployer);
    console.log(`vGlobalMinter address: ${globalMinter.address}`);
    const chainMinter = await ethers.getContract('chainMinter', deployer);
    console.log(`vChainMinter address: ${chainMinter.address}`);
    const vrsw = await ethers.getContractAt('Vrsw', await globalMinter.vrsw());
    console.log('Preparing for the next epoch...');
    const vrswBalanceBefore = await vrsw.balanceOf(deployer);
    await (await globalMinter.nextEpochTransfer()).wait();
    const vrswBalanceAfter = await vrsw.balanceOf(deployer);
    const vrswToTransfer = vrswBalanceAfter.sub(vrswBalanceBefore);
    console.log(`VRSW for the next epoch: ${vrswToTransfer}`);
    await (await vrsw.approve(chainMinter.address, vrswToTransfer)).wait();
    await chainMinter.prepareForNextEpoch(vrswToTransfer);
    console.log('Done!');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
