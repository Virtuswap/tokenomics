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
        contract: 'vTokenomicsParams',
        args: [],
        log: true,
        waitConfirmations: networkConfig[network.name].blockConfirmations || 0,
    });

    log('Deploying core contracts...');

    let timestamp: number;
    if (chainId == 31337) {
        timestamp = (await time.latest()) + 100;
    } else {
        const blockNumBefore = await hre.ethers.provider.getBlockNumber();
        const blockBefore = await hre.ethers.provider.getBlock(blockNumBefore);
        // CHANGEME
        timestamp = blockBefore.timestamp + 600; // 10 minute after now
    }

    const globalMinter = await deploy('globalMinter', {
        from: deployer,
        contract: 'vGlobalMinter',
        args: [timestamp],
        log: true,
        waitConfirmations: networkConfig[network.name].blockConfirmations || 0,
    });

    const globalMinterContract = await hre.ethers.getContractAt(
        'vGlobalMinter',
        globalMinter.address
    );
    const vrswTokenAddress = await globalMinterContract.vrsw();
    const gVrswTokenAddress = await globalMinterContract.gVrsw();

    const chainMinter = await deploy('chainMinter', {
        from: deployer,
        contract: 'vChainMinter',
        args: [
            timestamp,
            tokenomicsParams.address,
            vrswTokenAddress,
            gVrswTokenAddress,
        ],
        log: true,
    });

    const stakerFactory = await deploy('stakerFactory', {
        from: deployer,
        contract: 'vStakerFactory',
        args: [vrswTokenAddress, chainMinter.address, tokenomicsParams.address],
        log: true,
        waitConfirmations: networkConfig[network.name].blockConfirmations || 0,
    });

    const stakerFactoryContract = await hre.ethers.getContractAt(
        'vStakerFactory',
        stakerFactory.address
    );

    const chainMinterContract = await hre.ethers.getContractAt(
        'vChainMinter',
        chainMinter.address
    );

    const gVrswTokenContract = await hre.ethers.getContractAt(
        'GVrsw',
        gVrswTokenAddress
    );

    log('Core contracts deployed!');
    log('Setting stakerFactory for minter...');
    await chainMinterContract.setStakerFactory(stakerFactory.address);
    if ((await gVrswTokenContract.balanceOf(chainMinter.address)) == '0') {
        log('Minting gVRSW tokens for chain minter...');
        await (await globalMinterContract.addChainMinter()).wait();
        console.log(await gVrswTokenContract.balanceOf(deployer));
        await gVrswTokenContract.transfer(
            chainMinter.address,
            hre.ethers.utils.parseEther('1000000000')
        );
    }
    if (chainId == 80001) {
        // for testing purposes
        log('Setting epochParams...');
        // CHANGEME
        await globalMinterContract.setEpochParams('86400', '43200');
        // CHANGEME
        await chainMinterContract.setEpochParams('86400', '43200');
    }
    log('Done!');

    if (
        !developmentChains.includes(network.name) &&
        config.etherscan.apiKey.polygonMumbai
    ) {
        await verify(tokenomicsParams.address, []);
        await verify(globalMinter.address, [timestamp]);
        await verify(chainMinter.address, [
            timestamp,
            tokenomicsParams.address,
            vrswTokenAddress,
            gVrswTokenAddress,
        ]);
        await verify(stakerFactory.address, [
            vrswTokenAddress,
            chainMinter.address,
            tokenomicsParams.address,
        ]);
    }
};
export default deployCore;
deployCore.tags = ['all', 'core'];
