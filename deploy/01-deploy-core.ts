import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { time } from '@nomicfoundation/hardhat-network-helpers';

const deployCore: DeployFunction = async function (
    hre: HardhatRuntimeEnvironment
) {
    const { deployments, getNamedAccounts } = hre;
    const { deployer } = await getNamedAccounts();
    const { deploy } = deployments;

    const minter = await deploy('minter', {
        from: deployer,
        contract: 'vMinter',
        args: [await time.latest()],
        log: true,
    });

    const vrswToken = await deploy('vrswToken', {
        from: deployer,
        contract: 'Vrsw',
        args: [minter.address],
        log: true,
    });

    const gVrswToken = await deploy('gVrswToken', {
        from: deployer,
        contract: 'gVrsw',
        args: [minter.address],
        log: true,
    });

    await deploy('stakerFactory', {
        from: deployer,
        contract: 'vStakerFactory',
        args: [vrswToken.address, gVrswToken.address, minter.address],
        log: true,
    });
};
export default deployCore;
deployCore.tags = ['all', 'core'];
