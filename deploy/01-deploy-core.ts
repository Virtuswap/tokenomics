import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { networkConfig, developmentChains } from '../helper-hardhat-config';
import verify from '../utils/verify';

const deployCore: DeployFunction = async function (
    hre: HardhatRuntimeEnvironment
) {
    const { deployments, getNamedAccounts, network, config } = hre;
    const { deployer } = await getNamedAccounts();
    const { deploy, log } = deployments;
    const chainId: number = network.config.chainId!;

    const tokenomicsParams = await deploy('tokenomicsParams', {
        from: deployer,
        contract: 'VTokenomicsParams',
        args: [],
        log: true,
        waitConfirmations: networkConfig[network.name].blockConfirmations || 0,
    });

    log('Deploying core contracts...');

    let timestamp: number;
    let vPairFactoryAddress: string;
    if (chainId == 31337) {
        timestamp = (await time.latest()) + 604800; // 1 week after now
        vPairFactoryAddress = (await deployments.get('MockVPairFactory')).address;
    } else {
        const blockNumBefore = await hre.ethers.provider.getBlockNumber();
        const blockBefore = await hre.ethers.provider.getBlock(blockNumBefore);
        timestamp = blockBefore.timestamp;
        vPairFactoryAddress = networkConfig[network.name].vPairFactoryAddress || '';
    }

    const vrsw = await deploy('vrsw', {
        from: deployer,
        contract: 'Vrsw',
        args: [deployer],
        log: true,
        waitConfirmations: networkConfig[network.name].blockConfirmations || 0,
    });

    const vrswContract = await hre.ethers.getContractAt('Vrsw', vrsw.address);

    const globalMinter = await deploy('globalMinter', {
        from: deployer,
        contract: 'VGlobalMinter',
        args: [timestamp, vrsw.address],
        log: true,
        waitConfirmations: networkConfig[network.name].blockConfirmations || 0,
    });

    await vrswContract.transfer(
        globalMinter.address,
        await vrswContract.balanceOf(deployer)
    );

    const chainMinter = await deploy('chainMinter', {
        from: deployer,
        contract: 'VChainMinter',
        args: [
            timestamp,
            tokenomicsParams.address,
            vrsw.address
        ],
        log: true,
    });

    const staker = await deploy('staker', {
        from: deployer,
        contract: 'VStaker',
        args: [vrsw.address, chainMinter.address, tokenomicsParams.address, vPairFactoryAddress],
        log: true,
        waitConfirmations: networkConfig[network.name].blockConfirmations || 0,
    });

    log('Setting staker for VChainMinter...');
    const chainMinterContract = await hre.ethers.getContractAt('VChainMinter', chainMinter.address);
    await chainMinterContract.setStaker(staker.address);
    log('Done!');

    log('Core contracts deployed!');

    if (
        !developmentChains.includes(network.name) &&
        config.etherscan.apiKey.polygonMumbai
    ) {
        await verify(tokenomicsParams.address, []);
        await verify(globalMinter.address, [timestamp, vrsw.address]);
        await verify(chainMinter.address, [
            timestamp,
            tokenomicsParams.address,
            vrsw.address
        ]);
        await verify(staker.address, [
            vrsw.address,
            chainMinter.address,
            tokenomicsParams.address,
            vPairFactoryAddress
        ]);
    }
};
export default deployCore;
deployCore.tags = ['all', 'core'];
