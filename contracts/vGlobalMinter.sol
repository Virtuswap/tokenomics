// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import './libraries/EmissionMath.sol';
import './interfaces/IvGlobalMinter.sol';
import './vVestingWallet.sol';
import './Vrsw.sol';
import './GVrsw.sol';

/**
 * @title vGlobalMinter
 * @dev This contract is responsible for minting and distributing VRSW and gVrsw
 * tokens.
 */
contract vGlobalMinter is IvGlobalMinter, Ownable {
    // list of all vesting wallets that were created by the minter
    address[] public vestingWallets;

    // VRSW algorithmic distribution is divided into epochs

    // the timestamp of the current epoch start
    uint256 public startEpochTime;

    // current epoch duration (in seconds)
    uint256 public epochDuration;

    // the time (in seconds) before the next epoch to transfer the necessary
    // amount of VRSW tokens for the next epoch to distribute
    uint256 public epochPreparationTime;

    // the next epoch duration
    // if the value is zero then the next epoch duration is the same as the current
    // epoch duration
    uint256 public nextEpochDuration;

    // the next epoch preparation time
    // if the value is zero then the next epoch preparation time is the same as
    // the current epoch preparation time
    uint256 public nextEpochPreparationTime;

    // balance that is available for arbitraryTransfer and newVesting functions
    uint256 public unlockedBalance;

    // timestamp of VRSW emission start
    uint256 public immutable emissionStartTs;

    // VRSW token
    Vrsw public immutable vrsw;

    // gVRSW token
    GVrsw public immutable gVrsw;

    /**
     * @dev Constructor function
     * @param _emissionStartTs Timestamp of the start of emission
     */
    constructor(uint256 _emissionStartTs) {
        require(
            _emissionStartTs > block.timestamp,
            'invalid emission start timestamp'
        );
        emissionStartTs = _emissionStartTs;
        unlockedBalance = 5e8 * 1e18;
        epochDuration = 4 weeks;
        epochPreparationTime = 1 weeks;
        startEpochTime = _emissionStartTs - epochDuration;
        vrsw = new Vrsw(address(this));
        gVrsw = new GVrsw(address(this));
    }

    /// @inheritdoc IvGlobalMinter
    function addChainMinter() external override onlyOwner {
        gVrsw.mint(msg.sender, 1e9 * 1e18);
    }

    /// @inheritdoc IvGlobalMinter
    function newVesting(
        address beneficiary,
        uint256 startTs,
        uint256 duration,
        uint256 amount
    ) external override onlyOwner returns (address vestingWallet) {
        require(block.timestamp >= emissionStartTs, 'too early');
        require(amount <= unlockedBalance, 'not enough unlocked tokens');
        vestingWallet = address(
            new vVestingWallet(
                beneficiary,
                address(vrsw),
                uint64(startTs),
                uint64(duration)
            )
        );
        vestingWallets.push(vestingWallet);
        unlockedBalance -= amount;
        SafeERC20.safeTransfer(IERC20(vrsw), vestingWallet, amount);
        emit NewVesting(vestingWallet, beneficiary, startTs, duration);
    }

    /// @inheritdoc IvGlobalMinter
    function arbitraryTransfer(
        address to,
        uint256 amount
    ) external override onlyOwner {
        require(block.timestamp >= emissionStartTs, 'too early');
        require(amount <= unlockedBalance, 'not enough unlocked tokens');
        unlockedBalance -= amount;
        SafeERC20.safeTransfer(IERC20(vrsw), to, amount);
    }

    /// @inheritdoc IvGlobalMinter
    function nextEpochTransfer() external override onlyOwner {
        uint256 currentEpochEnd = startEpochTime + epochDuration;
        if (block.timestamp >= currentEpochEnd) {
            _epochTransition();
            currentEpochEnd = startEpochTime + epochDuration;
        }
        require(
            block.timestamp + epochPreparationTime >= currentEpochEnd,
            'Too early'
        );
        uint256 amountToTransfer = EmissionMath.calculateAlgorithmicEmission(
            currentEpochEnd - emissionStartTs,
            currentEpochEnd +
                (nextEpochDuration > 0 ? nextEpochDuration : epochDuration) -
                emissionStartTs
        );
        SafeERC20.safeTransfer(IERC20(vrsw), msg.sender, amountToTransfer);
    }

    /// @inheritdoc IvGlobalMinter
    function setEpochParams(
        uint256 _epochDuration,
        uint256 _epochPreparationTime
    ) external override onlyOwner {
        require(
            _epochPreparationTime > 0 && _epochDuration > 0,
            'must be greater than zero'
        );
        require(
            _epochPreparationTime < _epochDuration,
            'preparationTime >= epochDuration'
        );
        (nextEpochPreparationTime, nextEpochDuration) = (
            _epochPreparationTime,
            _epochDuration
        );
    }

    function _epochTransition() private {
        startEpochTime += epochDuration;
        if (nextEpochDuration > 0) {
            epochDuration = nextEpochDuration;
            nextEpochDuration = 0;
        }
        if (nextEpochPreparationTime > 0) {
            epochPreparationTime = nextEpochPreparationTime;
            nextEpochPreparationTime = 0;
        }
    }
}
