// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import './libraries/EmissionMath.sol';
import './interfaces/IvStakerFactory.sol';
import './interfaces/IvStaker.sol';
import './interfaces/IvMinter.sol';
import './vVestingWallet.sol';

contract vMinter is IvMinter, Ownable {
    struct StakerInfo {
        uint128 totalAllocated;
        uint128 totalTransferred;
        uint128 totalCompoundRate;
        uint128 lastUpdated;
    }

    uint128 public constant ALLOCATION_POINTS_FACTOR = 100;

    uint256 algorithmicEmissionBalance;

    mapping(address => StakerInfo) stakers;
    mapping(address => uint256) allocationPoints;
    uint256 totalAllocationPoints;
    address[] vestingWallets;

    address public immutable token;
    address public immutable stakerFactory;
    uint256 public immutable emissionStartTs;

    constructor(
        address _token,
        address _stakerFactory,
        uint256 _emissionStartTs
    ) {
        token = _token;
        stakerFactory = _stakerFactory;
        emissionStartTs = _emissionStartTs;
        algorithmicEmissionBalance = EmissionMath.TOTAL_ALGO_EMISSION;
    }

    function newVesting(
        address beneficiary,
        uint256 startTs,
        uint256 duration,
        uint256 amount
    ) external override onlyOwner returns (address vestingWallet) {
        require(amount <= unlockedBalance(), 'not enough unlocked tokens');
        vestingWallet = address(
            new vVestingWallet(
                token,
                beneficiary,
                uint64(startTs),
                uint64(duration)
            )
        );
        vestingWallets.push(vestingWallet);
        SafeERC20.safeTransfer(IERC20(token), vestingWallet, amount);
    }

    function setAllocationPoints(
        address[] calldata _stakers,
        uint256[] calldata _allocationPoints
    ) external override onlyOwner {
        uint256 newTotalAllocationPoints = totalAllocationPoints;
        StakerInfo memory stakerInfo;
        address _stakerFactory = stakerFactory;
        for (uint256 i = 0; i < _stakers.length; ++i) {
            require(
                IvStakerFactory(_stakerFactory).stakers(
                    IvStaker(_stakers[i]).lpToken()
                ) == _stakers[i],
                'invalid staker'
            );

            newTotalAllocationPoints =
                newTotalAllocationPoints +
                _allocationPoints[i] -
                allocationPoints[_stakers[i]];
            stakerInfo = stakers[_stakers[i]];
            // stakerInfo exists
            if (stakerInfo.lastUpdated > 0) {
                stakerInfo.totalCompoundRate +=
                    (EmissionMath.calculateCompoundRate(
                        stakerInfo.lastUpdated - emissionStartTs,
                        block.timestamp - emissionStartTs
                    ) * uint128(allocationPoints[_stakers[i]])) /
                    ALLOCATION_POINTS_FACTOR;
                stakerInfo.totalAllocated +=
                    (EmissionMath.calculateAlgorithmicEmission(
                        stakerInfo.lastUpdated - emissionStartTs,
                        block.timestamp - emissionStartTs
                    ) * uint128(allocationPoints[_stakers[i]])) /
                    ALLOCATION_POINTS_FACTOR;
            }
            stakerInfo.lastUpdated = uint128(block.timestamp);
            stakers[_stakers[i]] = stakerInfo;
            allocationPoints[_stakers[i]] = _allocationPoints[i];
        }
        require(
            newTotalAllocationPoints <= ALLOCATION_POINTS_FACTOR,
            'total allocation points > 100%'
        );
        totalAllocationPoints = newTotalAllocationPoints;
    }

    function arbitraryTransfer(
        address to,
        uint256 amount
    ) external override onlyOwner {
        require(amount <= unlockedBalance(), 'not enough unlocked tokens');
        SafeERC20.safeTransfer(IERC20(token), to, amount);
    }

    function transferRewards(address to, uint256 amount) external override {
        require(amount > 0, 'zero amount');
        require(
            IvStakerFactory(stakerFactory).stakers(
                IvStaker(msg.sender).lpToken()
            ) == msg.sender,
            'invalid staker'
        );
        StakerInfo memory stakerInfo = stakers[msg.sender];
        stakerInfo.totalAllocated +=
            (EmissionMath.calculateAlgorithmicEmission(
                stakerInfo.lastUpdated - emissionStartTs,
                block.timestamp - emissionStartTs
            ) * uint128(allocationPoints[msg.sender])) /
            ALLOCATION_POINTS_FACTOR;
        stakerInfo.totalCompoundRate +=
            (EmissionMath.calculateCompoundRate(
                stakerInfo.lastUpdated - emissionStartTs,
                block.timestamp - emissionStartTs
            ) * uint128(allocationPoints[msg.sender])) /
            ALLOCATION_POINTS_FACTOR;
        stakerInfo.lastUpdated = uint128(block.timestamp);
        require(
            amount <= stakerInfo.totalAllocated - stakerInfo.totalTransferred,
            'not enough tokens'
        );
        stakerInfo.totalTransferred += uint128(amount);
        stakers[msg.sender] = stakerInfo;
        algorithmicEmissionBalance -= amount;
        SafeERC20.safeTransfer(IERC20(token), to, amount);
    }

    function calculateTokensForStaker(
        address staker
    ) external view override returns (uint256) {
        StakerInfo memory stakerInfo = stakers[staker];
        return
            ((stakerInfo.totalAllocated +
                EmissionMath.calculateAlgorithmicEmission(
                    stakerInfo.lastUpdated - emissionStartTs,
                    block.timestamp - emissionStartTs
                )) * allocationPoints[staker]) / ALLOCATION_POINTS_FACTOR;
    }

    function calculateCompoundRateForStaker(
        address staker
    ) external view override returns (uint256) {
        StakerInfo memory stakerInfo = stakers[staker];
        return
            ((stakerInfo.totalCompoundRate +
                EmissionMath.calculateCompoundRate(
                    stakerInfo.lastUpdated - emissionStartTs,
                    block.timestamp - emissionStartTs
                )) * allocationPoints[staker]) / ALLOCATION_POINTS_FACTOR;
    }

    function unlockedBalance() public view returns (uint256) {
        return
            IERC20(token).balanceOf(address(this)) -
            algorithmicEmissionBalance -
            EmissionMath.currentlyLockedForProject(emissionStartTs);
    }
}
