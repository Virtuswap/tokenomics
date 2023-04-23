import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { deployments, ethers } from 'hardhat';
import { VTokenomicsParams } from '../typechain-types';

describe('vTokenomicsParams', function () {
    let accounts: SignerWithAddress[];
    let tokenomicsParams: VTokenomicsParams;

    beforeEach(async () => {
        // init
        accounts = await ethers.getSigners();
        await deployments.fixture(['all']);
        tokenomicsParams = await ethers.getContract('tokenomicsParams');
    });

    it('Only owner can call updateParams', async () => {
        await expect(
            tokenomicsParams
                .connect(accounts[1])
                .updateParams('1', '2', '3', '4', '5')
        ).to.revertedWith('Ownable: caller is not the owner');
    });

    it('UpdateParams works', async () => {
        const rNew = '11';
        const bNew = '21';
        const alphaNew = '31';
        const betaNew = '41';
        const gammaNew = '51';
        await tokenomicsParams.updateParams(
            rNew,
            bNew,
            alphaNew,
            betaNew,
            gammaNew
        );
        expect(await tokenomicsParams.r()).to.be.equal(rNew);
        expect(await tokenomicsParams.b()).to.be.equal(bNew);
        expect(await tokenomicsParams.alpha()).to.be.equal(alphaNew);
        expect(await tokenomicsParams.beta()).to.be.equal(betaNew);
        expect(await tokenomicsParams.gamma()).to.be.equal(gammaNew);
    });
});
