import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { time } from '@nomicfoundation/hardhat-network-helpers';

const deployCore: DeployFunction = async function (
    hre: HardhatRuntimeEnvironment
) {
    const { deployments, getNamedAccounts } = hre;
    const { deployer } = await getNamedAccounts();
    const { deploy } = deployments;

    const tokenomicsParams = await deploy('tokenomicsParams', {
        from: deployer,
        contract: 'vTokenomicsParams',
        args: [],
        log: true,
    });

    const minter = await deploy('minter', {
        from: deployer,
        contract: 'vMinter',
        args: [await time.latest(), tokenomicsParams.address],
        log: true,
    });

    const minterContract = await hre.ethers.getContractAt(
        'vMinter',
        minter.address
    );
    const vrswTokenAddress = await minterContract.vrsw();

    await deploy('stakerFactory', {
        from: deployer,
        contract: 'vStakerFactory',
        args: [vrswTokenAddress, minter.address, tokenomicsParams.address],
        log: true,
    });
};
export default deployCore;
deployCore.tags = ['all', 'core'];
