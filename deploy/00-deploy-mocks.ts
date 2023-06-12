import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const INITIAL_TOKEN_AMOUNT = '2000000000000000000000';
const deployMocks: DeployFunction = async function (
    hre: HardhatRuntimeEnvironment
) {
    const { deployments, getNamedAccounts, network } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    const chainId = network.config.chainId;

    if (chainId == 31337) {
        await deploy('MockVPairFactory', {
            contract: 'MockVPairFactory',
            from: deployer,
            log: true,
            args: [],
        });
        await deploy('Token0', {
            contract: 'Token0',
            from: deployer,
            log: true,
            args: [deployer, INITIAL_TOKEN_AMOUNT],
        });
        await deploy('Token1', {
            contract: 'Token1',
            from: deployer,
            log: true,
            args: [deployer, INITIAL_TOKEN_AMOUNT],
        });
        await deploy('Token2', {
            contract: 'Token2',
            from: deployer,
            log: true,
            args: [deployer, INITIAL_TOKEN_AMOUNT],
        });
    }
};
export default deployMocks;
deployMocks.tags = ['all', 'mocks'];
