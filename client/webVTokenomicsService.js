import vTokenomicsParamsABI from './constants/vTokenomicsParams.json'
import vMinterABI from './constants/vMinter.json'
import vStakerABI from './constants/vStakerFactory.json'
import vStakerFactoryABI from './constants/vStakerFactory.json'

import { ethers } from 'ethers' 

const vTokenomicsParamsAddress = process.env.REACT_APP_VTOKENOMICSPARAMS_ADDRESS
const vMinterAddress = process.env.REACT_APP_VMINTER_ADDRESS
const vStakerFactoryAddress = process.env.REACT_APP_VSTAKERFACTORY_ADDRESS

export default class VirtuSwapTokenomicsService {
    static getProvider = () => {
        if (window.ethereum) {
            return new ethers.providers.Web3Provider(window.ethereum)
        }
      }

    static getVTokenomicsParams = () => {
        const provider = this.getProvider()
        const signer = provider.getSigner()
        const vTokenomicsParams = new ethers.Contract(vTokenomicsParamsAddress, vTokenomicsParamsABI.abi, provider,)
        vTokenomicsParams.connect(signer)
        return vTokenomicsParams
    }

    static getVMinter = () => {
        const provider = this.getProvider()
        const signer = provider.getSigner()
        const vMinter = new ethers.Contract(vMinterAddress, vMinterABI.abi, provider,)
        vMinter.connect(signer)
        return vMinter
    }

    static getVStaker = (vStakerAddress) => {
        const provider = this.getProvider()
        const signer = provider.getSigner()
        const vStaker = new ethers.Contract(vStakerAddress, vStakerABI.abi, provider,)
        vStaker.connect(signer)
        return vStaker
    }

    static getVStakerFactory = () => {
        const provider = this.getProvider()
        const signer = provider.getSigner()
        const vStakerFactory = new ethers.Contract(vStakerFactoryAddress, vStakerFactoryABI.abi, provider,)
        vStakerFactory.connect(signer)
        return vStakerFactory
    }

    // vTokenomicsParams functions
    static updateTokenomicsParams = async (r, b, alpha, beta, gamma) => {
        const vTokenomicsParams = this.getVTokenomicsParams()
        await vTokenomicsParams.updateTokenomicsParams(r, b, alpha, beta, gamma)
    }

    // vMinter functions 
    static newVesting = async (beneficiary, startTs, duration, amount) => {
        const vMinter = this.getVMinter()
        const vestingWalletAddress = await vMinter.newVesting(beneficiary, startTs, duration, amount)
        return vestingWalletAddress
    }

    static setAllocationPoints = async (stakers, allocationPoints) => {
        const vMinter = this.getVMinter()
        await vMinter.setAllocationPoints(stakers, allocationPoints)
    }

    static setStakerFactory = async (newStakerFactory) => {
        const vMinter = this.getVMinter()
        await vMinter.setStakerFactory(newStakerFactory)
    }

    static arbitraryTransfer = async (to, amount) => {
        const vMinter = this.getVMinter()
        await vMinter.arbitraryTransfer(to, amount)
    }

    static calculateTokensForStaker = async (staker) => {
        const vMinter = this.getVMinter()
        await vMinter.calculateTokensForStaker(staker)
    }

    static calculateCompoundRrateForStaker = async (staker) => {
        const vMinter = this.getVMinter()
        await vMinter.calculateCompoundRrateForStaker(staker)
    }

    // vStaker functions
    static stakeVrsw = async (stakerAddress, amount) => {
        const vStaker = this.getVStaker(stakerAddress)
        await vStaker.stakeVrsw(amount)
    }

    static stakeLp = async (stakerAddress, amount) => {
        const vStaker = this.getVStaker(stakerAddress)
        await vStaker.stakeLp(amount)
    }

    static claimRewards = async (stakerAddress) => {
        const vStaker = this.getVStaker(stakerAddress)
        await vStaker.claimRewards()
    }

    static viewRewards = async (stakerAddress, who) => {
        const vStaker = this.getVStaker(stakerAddress)
        return await vStaker.viewRewards(who)
    }

    static viewStakes = async (stakerAddress) => {
        const vStaker = this.getVStaker(stakerAddress)
        await vStaker.viewStakes()
    }

    static unstakeLp = async (stakerAddress, amount) => {
        const vStaker = this.getVStaker(stakerAddress)
        await vStaker.unstakeLp(amount)
    }

    static lockVrsw = async (stakerAddress, amount, lockDuration) => {
        const vStaker = this.getVStaker(stakerAddress)
        await vStaker.lockVrsw(amount, lockDuration)
    }

    static lockStakedVrsw = async (stakerAddress, amount, lockDuration) => {
        const vStaker = this.getVStaker(stakerAddress)
        await vStaker.lockStakedVrsw(amount, lockDuration)
    }

    static unstakeVrsw = async (stakerAddress, amount) => {
        const vStaker = this.getVStaker(stakerAddress)
        await vStaker.unstakeVrsw(amount)
    }

    static checkLock = async (stakerAddress, who) => {
        const vStaker = this.getVStaker(stakerAddress)
        await vStaker.checkLock(who)
    }

    static withdrawUnlockedVrsw = async (stakerAddress, who) => {
        const vStaker = this.getVStaker(stakerAddress)
        await vStaker.withdrawUnlockedVrsw(who)
    }
}
