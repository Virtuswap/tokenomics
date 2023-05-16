// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./libraries/EmissionMath.sol";
import "./interfaces/IVGlobalMinter.sol";
import "./VVestingWallet.sol";
import "./Vrsw.sol";
import "./GVrsw.sol";

/**
 * @title vGlobalMinter
 * @dev This contract is responsible for minting and distributing VRSW and gVrsw
 * tokens.
 */
contract VGlobalMinter is IVGlobalMinter, Ownable {
    // list of all vesting wallets that were created by the minter
    address[] public vestingWallets;

    // VRSW algorithmic distribution is divided into epochs

    // the timestamp of the current epoch start
    uint32 public startEpochTime;

    // current epoch duration (in seconds)
    uint32 public epochDuration;

    // the time (in seconds) before the next epoch to transfer the necessary
    // amount of VRSW tokens for the next epoch to distribute
    uint32 public epochPreparationTime;

    // the next epoch duration
    // if the value is zero then the next epoch duration is the same as the current
    // epoch duration
    uint32 public nextEpochDuration;

    // the next epoch preparation time
    // if the value is zero then the next epoch preparation time is the same as
    // the current epoch preparation time
    uint32 public nextEpochPreparationTime;

    // timestamp of VRSW emission start
    uint32 public emissionStartTs;

    // balance that is available for arbitraryTransfer and newVesting functions
    uint256 public unlockedBalance;

    // VRSW token
    Vrsw public immutable vrsw;

    // gVRSW token
    GVrsw public immutable gVrsw;

    /**
     * @dev Constructor function
     * @param _emissionStartTs Timestamp of the start of emission
     */
    constructor(uint32 _emissionStartTs) {
        require(
            _emissionStartTs > block.timestamp,
            "invalid emission start timestamp"
        );
        emissionStartTs = _emissionStartTs;
        unlockedBalance = 5e8 * 1e18;
        epochDuration = 4 weeks;
        epochPreparationTime = 1 weeks;
        startEpochTime = _emissionStartTs - epochDuration;
        vrsw = new Vrsw(address(this));
        gVrsw = new GVrsw(address(this));
    }

    /// @inheritdoc IVGlobalMinter
    function addChainMinter() external override onlyOwner {
        gVrsw.mint(msg.sender, 1e9 * 1e18);
    }

    /// @inheritdoc IVGlobalMinter
    function newVesting(
        address beneficiary,
        uint32 startTs,
        uint32 duration,
        uint256 amount
    ) external override onlyOwner returns (address vestingWallet) {
        require(amount <= unlockedBalance, "not enough unlocked tokens");
        require(amount > 0, "amount must be positive");
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

    /// @inheritdoc IVGlobalMinter
    function arbitraryTransfer(
        address to,
        uint256 amount
    ) external override onlyOwner {
        require(amount <= unlockedBalance, "not enough unlocked tokens");
        require(amount > 0, "amount must be positive");
        unlockedBalance -= amount;
        SafeERC20.safeTransfer(IERC20(vrsw), to, amount);
    }

    function delayEmissionStart(uint32 newEmissionStartTs) external onlyOwner {
        require(newEmissionStartTs > block.timestamp, "cannot be in the past");
        require(block.timestamp < emissionStartTs, "emission has begun");
        emissionStartTs = newEmissionStartTs;
    }

    /// @inheritdoc IVGlobalMinter
    function nextEpochTransfer() external override onlyOwner {
        uint256 currentEpochEnd = startEpochTime + epochDuration;
        _epochTransition();
        // now startEpochTime points to the next epoch start
        require(
            block.timestamp + epochPreparationTime >= startEpochTime,
            "Too early"
        );
        uint256 amountToTransfer = EmissionMath.calculateAlgorithmicEmission(
            currentEpochEnd - emissionStartTs,
            startEpochTime + epochDuration - emissionStartTs
        );
        SafeERC20.safeTransfer(IERC20(vrsw), msg.sender, amountToTransfer);
    }

    /// @inheritdoc IVGlobalMinter
    function setEpochParams(
        uint32 _epochDuration,
        uint32 _epochPreparationTime
    ) external override onlyOwner {
        require(
            _epochPreparationTime > 0 && _epochDuration > 0,
            "must be greater than zero"
        );
        require(
            _epochPreparationTime < _epochDuration,
            "preparationTime >= epochDuration"
        );
        (nextEpochPreparationTime, nextEpochDuration) = (
            _epochPreparationTime,
            _epochDuration
        );
    }

    function getAllVestingWallets()
        external
        view
        override
        returns (address[] memory)
    {
        return vestingWallets;
    }

    function _epochTransition() private {
        uint256 _startEpochTime = startEpochTime + epochDuration;
        if (nextEpochDuration > 0) {
            epochDuration = nextEpochDuration;
            nextEpochDuration = 0;
        }
        if (nextEpochPreparationTime > 0) {
            epochPreparationTime = nextEpochPreparationTime;
            nextEpochPreparationTime = 0;
        }
        uint256 _epochDuration = epochDuration;
        while (block.timestamp >= _startEpochTime) {
            _startEpochTime += _epochDuration;
        }
        startEpochTime = uint32(_startEpochTime);
    }
}
