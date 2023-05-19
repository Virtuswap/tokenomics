// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./interfaces/IVStakerFactory.sol";
import "./interfaces/IVStaker.sol";
import "./interfaces/IVChainMinter.sol";
import "./interfaces/IVTokenomicsParams.sol";

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

    // staker factory address
    address public stakerFactory;

    // timestamp of VRSW emission start
    uint256 public immutable emissionStartTs;

    // tokenomics params contract address
    address public immutable tokenomicsParams;

    // VRSW token address
    address public immutable vrsw;

    // gVRSW token address
    address public immutable gVrsw;

    /**
     * @dev Constructor function
     * @param _emissionStartTs Timestamp of the start of emission
     * @param _tokenomicsParams Address of the tokenomics parameters contract
     * @param _vrsw Address of the VRSW token
     * @param _gVrsw Address of the gVRSW token
     */
    constructor(
        uint32 _emissionStartTs,
        address _tokenomicsParams,
        address _vrsw,
        address _gVrsw
    ) {
        require(
            _tokenomicsParams != address(0),
            "tokenomicsParams zero address"
        );
        require(_vrsw != address(0), "vrsw zero address");
        require(_gVrsw != address(0), "gVrsw zero address");
        tokenomicsParams = _tokenomicsParams;
        emissionStartTs = _emissionStartTs;
        epochDuration = 4 weeks;
        epochPreparationTime = 1 weeks;
        startEpochTime = _emissionStartTs - epochDuration;
        vrsw = _vrsw;
        gVrsw = _gVrsw;
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
    function setStakerFactory(
        address _newStakerFactory
    ) external override onlyOwner {
        require(_newStakerFactory != address(0), "zero address");
        require(stakerFactory == address(0), "staker factory can be set once");
        stakerFactory = _newStakerFactory;
        emit NewStakerFactory(_newStakerFactory);
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
        address[] calldata _stakers,
        uint256[] calldata _allocationPoints
    ) external override onlyOwner {
        require(_stakers.length == _allocationPoints.length, "lengths differ");
        if (block.timestamp >= startEpochTime + epochDuration)
            _epochTransition();

        uint256 availableTokens = _availableTokens();
        int256 _totalAllocationPoints = int256(totalAllocationPoints);
        address _stakerFactory = stakerFactory;
        StakerInfo memory stakerInfo;
        for (uint256 i = 0; i < _stakers.length; ++i) {
            require(
                IVStakerFactory(_stakerFactory).getPoolStaker(
                    IVStaker(_stakers[i]).lpToken()
                ) == _stakers[i],
                "invalid staker"
            );

            stakerInfo = stakers[_stakers[i]];
            _updateStakerInfo(
                stakerInfo,
                allocationPoints[_stakers[i]],
                availableTokens
            );
            stakers[_stakers[i]] = stakerInfo;

            _totalAllocationPoints +=
                int256(_allocationPoints[i]) -
                int256(allocationPoints[_stakers[i]]);
            allocationPoints[_stakers[i]] = _allocationPoints[i];
        }
        require(
            uint256(_totalAllocationPoints) <= ALLOCATION_POINTS_FACTOR,
            "sum must be less than 100%"
        );
        totalAllocationPoints = uint256(_totalAllocationPoints);
    }

    /// @inheritdoc IVChainMinter
    function transferRewards(address to, uint256 amount) external override {
        require(block.timestamp >= emissionStartTs, "too early");
        require(
            IVStakerFactory(stakerFactory).getPoolStaker(
                IVStaker(msg.sender).lpToken()
            ) == msg.sender,
            "invalid staker"
        );
        if (block.timestamp >= startEpochTime + epochDuration)
            _epochTransition();

        StakerInfo memory stakerInfo = stakers[msg.sender];
        _updateStakerInfo(
            stakerInfo,
            allocationPoints[msg.sender],
            _availableTokens()
        );

        stakers[msg.sender] = stakerInfo;
        SafeERC20.safeTransfer(IERC20(vrsw), to, amount);
        emit TransferRewards(to, amount);
    }

    /// @inheritdoc IVChainMinter
    function mintGVrsw(address to, uint256 amount) external override {
        require(amount > 0, "zero amount");
        require(
            IVStakerFactory(stakerFactory).getPoolStaker(
                IVStaker(msg.sender).lpToken()
            ) == msg.sender,
            "invalid staker"
        );
        SafeERC20.safeTransfer(IERC20(gVrsw), to, amount);
    }

    /// @inheritdoc IVChainMinter
    function burnGVrsw(address from, uint256 amount) external override {
        require(amount > 0, "zero amount");
        require(
            IVStakerFactory(stakerFactory).getPoolStaker(
                IVStaker(msg.sender).lpToken()
            ) == msg.sender,
            "invalid staker"
        );
        SafeERC20.safeTransferFrom(IERC20(gVrsw), from, address(this), amount);
    }

    /// @inheritdoc IVChainMinter
    function triggerEpochTransition() external override {
        require(block.timestamp >= startEpochTime + epochDuration, "Too early");
        _epochTransition();
    }

    /// @inheritdoc IVChainMinter
    function calculateTokensForStaker(
        address staker
    ) external view override returns (uint256) {
        uint256 _tokensAvailable = block.timestamp >=
            startEpochTime + epochDuration
            ? _availableTokensForNextEpoch()
            : _availableTokens();
        StakerInfo memory stakerInfo = stakers[staker];
        _updateStakerInfo(
            stakerInfo,
            allocationPoints[staker],
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
