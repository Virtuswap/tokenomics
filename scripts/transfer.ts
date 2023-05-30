import { ethers, getNamedAccounts } from 'hardhat';

async function main() {
    const tokens = [
        '0xa6365af8070f55De3DDCf36a444504353dd7D121',
        '0x6Bb047125AE5CbC6297D358Ad4A651089746185c',
        '0x0C95802DC61A3f991B7710b821955029E0B2D649',
        '0x614BAc08CFDEFc67c0bC9C1f9542e1C832Ff3356',
        '0x6292a04A84a302Cc52641f293C1c04949b314083',
        '0xE94Ff4D87415D5CE376382Fad701FD7E77be9B95',
        '0xA4462aA8a79310FD691BD1B2Ba702Ed884F3A93b',
        '0x9F83880F5F4C2d8e609655B87AeeaCBFb3a1a9F5',
        '0x676667Ce2AAa9Aa85CD692eB058D0763c3F58F6b',
        '0x5639881F7a3F07fbD54fC3a714Ea44EE964c9547',
        '0x7cF40C7975EBBD495d32f6879984E5d849858489',
        '0xA70dE8592cD98EDC01988d68b5b5Bb3CC593fE88',
    ];

    const wallets = [
        '0xF5B2e1f6Ee2D4ba20E062cB1f25604B6Aec788AE',
        '0x8C97276Dc4E39eB204D456C173d3Fb88076E6cC7',
        '0xD76aFbF69b5671075Df5eAea346a43dC95d039EC',
        '0x45aCEb2827867B472f7E366B134a2515e64e585D',
        '0xDDcb321cf920EEC1795c1BeEbACaD625536aA5B2',
        '0x227071bd1D45a926885612b2c53807F8D8f7aBAf',
        '0xD4DDcCB1A0f2e4f57eCCF73dB29FBCf3E75f8c1b',
        '0xd8226d5522BC2f3ecaE4B02158A74C988Fc7888c',
        '0x1F352F6f1c3B6d32062769025E7844eA8c2aa4Df',
        '0x41E57e3aAf7d4f393CCF62E1DF0DF327576a9925',
    ];

    const { deployer } = await getNamedAccounts();

    const erc20ABI = [
        'function transfer(address to, uint256 amount) returns (bool)',
        'function balanceOf(address to) returns (uint256)',
        'function decimals() returns (uint8)',
    ];

    const signer = await ethers.getSigner(deployer);
    for (const token of tokens) {
        const erc20 = new ethers.Contract(token, erc20ABI, signer);
        for (const wallet of wallets) {
            console.log(`Sending ${token} to ${wallet}...`);
            const decimals = await erc20.callStatic.decimals();
            await (
                await erc20.transfer(
                    wallet,
                    ethers.utils.parseUnits('1000', decimals)
                )
            ).wait();
        }
    }

    for (const wallet of wallets) {
        console.log(`Sending ether to ${wallet}...`);
        await (
            await signer.sendTransaction({
                to: wallet,
                value: ethers.utils.parseEther('2'),
            })
        ).wait();
    }

    console.log('Verifying...');
    for (const token of tokens) {
        const erc20 = new ethers.Contract(token, erc20ABI, signer);
        for (const wallet of wallets) {
            const balance = await erc20.callStatic.balanceOf(wallet);
            console.log(
                `Wallet ${wallet} has ${balance.toString()} ${token} tokens`
            );
        }
    }
    for (const wallet of wallets) {
        console.log(
            `Wallet ${wallet} has ${await ethers.provider.getBalance(
                wallet
            )} ETH`
        );
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
