// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./interfaces/IVStaker.sol";
import "./interfaces/IVChainMinter.sol";
import "./interfaces/IVTokenomicsParams.sol";
import "./VeVrsw.sol";

/**
 * @title vChainMinter
 * @dev This contract is responsible for distributing VRSW ang gVRSW tokens to stakers
 */
contract VChainMinter is IVChainMinter, Ownable {
    struct StakerInfo {
        uint128 totalAllocated; // Total amount of VRSW tokens allocated to the staker
        uint128 lastUpdated; // Timestamp of the last update to the staker info
        uint256 lastAvailable; // The snapshot of the availableTokens
    }

    uint256 public constant ALLOCATION_POINTS_FACTOR = 100;

    // number of VRSW tokens allocated for the current epoch
    uint256 public currentEpochBalance;

    // number of VRSW tokens allocated for the next epoch
    uint256 public nextEpochBalance;

    // current epoch duration (in seconds)
    uint32 public epochDuration;

    // the time (in seconds) before the next epoch to transfer the necessary
    // amount of VRSW tokens for the next epoch to distribute
    uint32 public epochPreparationTime;

    // the next epoch duration (in seconds)
    // if the value is zero then the next epoch duration is the same as the current
    // epoch duration
    uint32 public nextEpochDuration;

    // the next epoch preparation time (in seconds)
    // if the value is zero then the next epoch preparation time is the same as
    // the current epoch preparation time
    uint32 public nextEpochPreparationTime;

    // the timestamp of the current epoch start (in seconds)
    uint32 public startEpochTime;

    // balance of VRSW tokens when the current epoch started
    uint256 public startEpochSupply;

    // total allocation points currently (must be always less than or equal to ALLOCATION_POINTS_FACTOR)
    uint256 public totalAllocationPoints;

    // stakers info
    mapping(address => StakerInfo) public stakers;

    // allocation points of stakers
    mapping(address => uint256) public allocationPoints;

    address public staker;

    // timestamp of VRSW emission start
    uint256 public immutable emissionStartTs;

    // tokenomics params contract address
    address public immutable tokenomicsParams;

    // VRSW token address
    address public immutable vrsw;

    // veVRSW token address
    VeVrsw public immutable veVrsw;

    /**
     * @dev Constructor function
     * @param _emissionStartTs Timestamp of the start of emission
     * @param _tokenomicsParams Address of the tokenomics parameters contract
     * @param _vrsw Address of the VRSW token
     */
    constructor(
        uint32 _emissionStartTs,
        address _tokenomicsParams,
        address _vrsw
    ) {
        require(
            _tokenomicsParams != address(0),
            "tokenomicsParams zero address"
        );
        require(_vrsw != address(0), "vrsw zero address");
        tokenomicsParams = _tokenomicsParams;
        emissionStartTs = _emissionStartTs;
        epochDuration = 4 weeks;
        epochPreparationTime = 1 weeks;
        startEpochTime = _emissionStartTs - epochDuration;
        vrsw = _vrsw;
        veVrsw = new VeVrsw(address(this));
    }

    /// @inheritdoc IVChainMinter
    function prepareForNextEpoch(
        uint256 nextBalance
    ) external override onlyOwner {
        uint256 currentEpochEnd = startEpochTime + epochDuration;
        require(
            block.timestamp + epochPreparationTime >= currentEpochEnd &&
                block.timestamp < currentEpochEnd,
            "Too early"
        );
        int256 diff = int256(nextBalance) - int256(nextEpochBalance);
        nextEpochBalance = nextBalance;
        if (diff > 0) {
            SafeERC20.safeTransferFrom(
                IERC20(vrsw),
                msg.sender,
                address(this),
                uint256(diff)
            );
        } else if (diff < 0) {
            SafeERC20.safeTransfer(IERC20(vrsw), msg.sender, uint256(-diff));
        }
    }

    /// @inheritdoc IVChainMinter
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

    /// @inheritdoc IVChainMinter
    function setAllocationPoints(
        address[] calldata _lpTokens,
        uint256[] calldata _allocationPoints
    ) external override onlyOwner {
        require(_lpTokens.length == _allocationPoints.length, "lengths differ");
        if (block.timestamp >= startEpochTime + epochDuration)
            _epochTransition();

        uint256 availableTokens = _availableTokens();
        int256 _totalAllocationPoints = int256(totalAllocationPoints);
        IVStaker _staker = IVStaker(staker);
        StakerInfo memory stakerInfo;
        for (uint256 i = 0; i < _lpTokens.length; ++i) {
            require(
                _lpTokens[i] == address(0) ||
                    _staker.isLpTokenValid(_lpTokens[i]),
                "one of lp tokens is not valid"
            );

            stakerInfo = stakers[_lpTokens[i]];
            _updateStakerInfo(
                stakerInfo,
                allocationPoints[_lpTokens[i]],
                availableTokens
            );
            stakers[_lpTokens[i]] = stakerInfo;

            _totalAllocationPoints +=
                int256(_allocationPoints[i]) -
                int256(allocationPoints[_lpTokens[i]]);
            allocationPoints[_lpTokens[i]] = _allocationPoints[i];
        }
        require(
            uint256(_totalAllocationPoints) <= ALLOCATION_POINTS_FACTOR,
            "sum must be less than 100%"
        );
        totalAllocationPoints = uint256(_totalAllocationPoints);
    }

    /// @inheritdoc IVChainMinter
    function transferRewards(
        address to,
        address lpToken,
        uint256 amount
    ) external override {
        require(block.timestamp >= emissionStartTs, "too early");
        require(staker == msg.sender, "invalid staker");
        if (block.timestamp >= startEpochTime + epochDuration)
            _epochTransition();

        StakerInfo memory stakerInfo = stakers[lpToken];
        _updateStakerInfo(
            stakerInfo,
            allocationPoints[lpToken],
            _availableTokens()
        );

        stakers[lpToken] = stakerInfo;
        SafeERC20.safeTransfer(IERC20(vrsw), to, amount);
        emit TransferRewards(to, lpToken, amount);
    }

    /// @inheritdoc IVChainMinter
    function mintVeVrsw(address to, uint256 amount) external override {
        require(amount > 0, "zero amount");
        require(staker == msg.sender, "invalid staker");
        veVrsw.mint(to, amount);
    }

    /// @inheritdoc IVChainMinter
    function burnVeVrsw(address from, uint256 amount) external override {
        require(amount > 0, "zero amount");
        require(staker == msg.sender, "invalid staker");
        veVrsw.burn(from, amount);
    }

    /// @inheritdoc IVChainMinter
    function triggerEpochTransition() external override {
        require(block.timestamp >= startEpochTime + epochDuration, "Too early");
        _epochTransition();
    }

    function setStaker(address _newStaker) external override onlyOwner {
        require(_newStaker != address(0), "zero address");
        require(staker == address(0), "staker can be set once");
        staker = _newStaker;
        emit NewStaker(_newStaker);
    }

    /// @inheritdoc IVChainMinter
    function calculateTokensForStaker(
        address lpToken
    ) external view override returns (uint256) {
        uint256 _tokensAvailable = block.timestamp >=
            startEpochTime + epochDuration
            ? _availableTokensForNextEpoch()
            : _availableTokens();
        StakerInfo memory stakerInfo = stakers[lpToken];
        _updateStakerInfo(
            stakerInfo,
            allocationPoints[lpToken],
            _tokensAvailable
        );
        return stakerInfo.totalAllocated;
    }

    /**
     * @dev Transfers through multiple epochs right to the epoch, which
     * start is before block.timestamp
     */
    function _epochTransition() private {
        startEpochTime += epochDuration;
        startEpochSupply += currentEpochBalance;
        currentEpochBalance = nextEpochBalance;
        if (nextEpochDuration > 0) {
            epochDuration = nextEpochDuration;
            nextEpochDuration = 0;
        }
        if (nextEpochPreparationTime > 0) {
            epochPreparationTime = nextEpochPreparationTime;
            nextEpochPreparationTime = 0;
        }
        nextEpochBalance = 0;
        uint256 _startEpochTime = startEpochTime;
        uint256 _epochDuration = epochDuration;
        if (block.timestamp >= _startEpochTime + _epochDuration) {
            startEpochSupply += currentEpochBalance;
            currentEpochBalance = 0;
        }
        while (block.timestamp >= _startEpochTime + _epochDuration) {
            _startEpochTime += _epochDuration;
        }
        startEpochTime = uint32(_startEpochTime);
    }

    /**
     * @dev Updates the specified staker's allocation information based on the current state of the emission.
     * @param stakerInfo The current allocation information for the staker.
     * @param _allocationPoints The allocation points for the staker's contract.
     */
    function _updateStakerInfo(
        StakerInfo memory stakerInfo,
        uint256 _allocationPoints,
        uint256 _tokensAvailable
    ) private view {
        uint256 _emissionStartTs = emissionStartTs;
        if (
            stakerInfo.lastUpdated > 0 &&
            block.timestamp > stakerInfo.lastUpdated
        ) {
            stakerInfo.totalAllocated += uint128(
                ((_tokensAvailable - stakerInfo.lastAvailable) *
                    uint128(_allocationPoints)) / ALLOCATION_POINTS_FACTOR
            );
            stakerInfo.lastAvailable = _tokensAvailable;
        }
        stakerInfo.lastUpdated = uint128(
            Math.max(block.timestamp, _emissionStartTs)
        );
    }

    /**
     * @dev Calculates number of VRSW tokens currently available for algorithmic
     * distribution.
     */
    function _availableTokens() private view returns (uint256) {
        return
            startEpochSupply +
            (Math.min(block.timestamp - startEpochTime, epochDuration) *
                currentEpochBalance) /
            epochDuration;
    }

    /**
     * @dev Calculates number of VRSW tokens that are available for algorithmic
     * distribution in case when now is epoch N and block.timestamp is in epoch N + 1.
     */
    function _availableTokensForNextEpoch() private view returns (uint256) {
        uint32 _nextEpochDuration = (
            nextEpochDuration > 0 ? nextEpochDuration : epochDuration
        );
        return
            (startEpochSupply + currentEpochBalance) +
            (Math.min(
                block.timestamp - startEpochTime - epochDuration,
                _nextEpochDuration
            ) * nextEpochBalance) /
            _nextEpochDuration;
    }
}
