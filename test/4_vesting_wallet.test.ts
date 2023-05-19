import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { deployments, ethers } from 'hardhat';
import { GVrsw, Vrsw, VGlobalMinter, VVestingWallet } from '../typechain-types';
import { time, mine } from '@nomicfoundation/hardhat-network-helpers';

describe('VVestingWallet', function () {
    let vrsw: Vrsw;
    let gVrsw: GVrsw;
    let minter: VGlobalMinter;
    let accounts: SignerWithAddress[];

    beforeEach(async () => {
        accounts = await ethers.getSigners();
        await deployments.fixture(['all']);
        minter = await ethers.getContract('globalMinter');
        await minter.arbitraryTransfer(
            accounts[0].address,
            ethers.utils.parseEther('10000')
        );
        vrsw = await ethers.getContractAt('Vrsw', await minter.vrsw());
    });

    it('cannot deploy VestingWallet with invalid parameters', async () => {
        const vestingWalletFactory = await ethers.getContractFactory(
            'vVestingWallet'
        );
        await expect(
            vestingWalletFactory.deploy(
                ethers.constants.AddressZero,
                vrsw.address,
                (await time.latest()) + 100,
                30
            )
        ).to.revertedWith('vVestingWallet: beneficiary is zero address');
        await expect(
            vestingWalletFactory.deploy(
                accounts[1].address,
                ethers.constants.AddressZero,
                (await time.latest()) + 100,
                30
            )
        ).to.revertedWith('vVestingWallet: erc20Token is zero address');
        await expect(
            vestingWalletFactory.deploy(
                accounts[1].address,
                vrsw.address,
                await time.latest(),
                30
            )
        ).to.revertedWith("vVestingWallet: start couldn't be in the past");
        await expect(
            vestingWalletFactory.deploy(
                accounts[1].address,
                vrsw.address,
                (await time.latest()) + 100,
                0
            )
        ).to.revertedWith('vVestingWallet: duration must be positive');
    });

    it('release can be called only by beneficiary', async () => {
        const vestingWalletFactory = await ethers.getContractFactory(
            'vVestingWallet'
        );
        const vestingWallet = await vestingWalletFactory.deploy(
            accounts[1].address,
            vrsw.address,
            (await time.latest()) + 100,
            30
        );
        await expect(vestingWallet.release()).to.revertedWith(
            'only beneficiary'
        );
    });

    it('vesting schedule is correct', async () => {
        const vestingWalletFactory = await ethers.getContractFactory(
            'vVestingWallet'
        );
        const start = (await time.latest()) + 100;
        const duration = 100;
        const vestingWallet = await vestingWalletFactory.deploy(
            accounts[1].address,
            vrsw.address,
            start,
            duration
        );
        await vrsw.transfer(
            vestingWallet.address,
            ethers.utils.parseEther('1000')
        );
        expect(
            await vestingWallet.vestedAmount(await time.latest())
        ).to.be.equal(0);
        await time.setNextBlockTimestamp((await time.latest()) + 148);
        await mine();
        expect(
            await vestingWallet.vestedAmount(await time.latest())
        ).to.be.equal(ethers.utils.parseEther('500'));
        await time.setNextBlockTimestamp((await time.latest()) + 50);
        await mine();
        expect(
            await vestingWallet.vestedAmount(await time.latest())
        ).to.be.equal(ethers.utils.parseEther('1000'));
    });
});
