import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { networkConfig } from '../helper-hardhat-config';

const deployCore: DeployFunction = async function (
    hre: HardhatRuntimeEnvironment
) {
    const { deployments, getNamedAccounts, network } = hre;
    const { deployer } = await getNamedAccounts();
    const { deploy, log } = deployments;
    const chainId: number = network.config.chainId!;

    const tokenomicsParams = await deploy('tokenomicsParams', {
        from: deployer,
        contract: 'vTokenomicsParams',
        args: [],
        log: true,
        waitConfirmations: networkConfig[network.name].blockConfirmations || 0,
    });

    log('Deploying core contracts...');

    let timestamp: number;
    if (chainId == 31337) {
        timestamp = await time.latest();
    } else {
        const blockNumBefore = await hre.ethers.provider.getBlockNumber();
        const blockBefore = await hre.ethers.provider.getBlock(blockNumBefore);
        timestamp = blockBefore.timestamp;
    }

    const minter = await deploy('minter', {
        from: deployer,
        contract: 'vMinter',
        args: [timestamp, tokenomicsParams.address],
        log: true,
        waitConfirmations: networkConfig[network.name].blockConfirmations || 0,
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
        waitConfirmations: networkConfig[network.name].blockConfirmations || 0,
    });
    log('Core contracts deployed!');
};
export default deployCore;
deployCore.tags = ['all', 'core'];
