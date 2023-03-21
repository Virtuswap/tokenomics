// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';
import './libraries/EmissionMath.sol';
import './interfaces/IvStakerFactory.sol';
import './interfaces/IvStaker.sol';
import './interfaces/IvMinter.sol';
import './interfaces/IvTokenomicsParams.sol';
import './vVestingWallet.sol';
import './Vrsw.sol';
import './GVrsw.sol';

contract vMinter is IvMinter, Ownable {
    struct StakerInfo {
        uint128 totalAllocated;
        uint128 totalTransferred;
        uint128 totalCompoundRate;
        uint128 lastUpdated;
    }

    uint128 public constant ALLOCATION_POINTS_FACTOR = 100;

    uint256 public algorithmicEmissionBalance;

    mapping(address => StakerInfo) public stakers;
    mapping(address => uint256) public allocationPoints;
    address[] public vestingWallets;

    Vrsw public vrsw;
    GVrsw public gVrsw;
    address public stakerFactory;

    uint256 public immutable emissionStartTs;
    address public immutable tokenomicsParams;

    constructor(uint256 _emissionStartTs, address _tokenomicsParams) {
        emissionStartTs = _emissionStartTs;
        tokenomicsParams = _tokenomicsParams;
        algorithmicEmissionBalance = EmissionMath.TOTAL_ALGO_EMISSION;
        vrsw = new Vrsw(address(this));
        gVrsw = new GVrsw(address(this));
    }

    function setStakerFactory(
        address _newStakerFactory
    ) external override onlyOwner {
        stakerFactory = _newStakerFactory;
        emit NewStakerFactory(_newStakerFactory);
    }

    function newVesting(
        address beneficiary,
        uint256 startTs,
        uint256 duration,
        uint256 amount
    ) external override onlyOwner returns (address vestingWallet) {
        require(block.timestamp >= emissionStartTs, 'too early');
        require(amount <= unlockedBalance(), 'not enough unlocked tokens');
        vestingWallet = address(
            new vVestingWallet(
                beneficiary,
                address(vrsw),
                uint64(startTs),
                uint64(duration)
            )
        );
        vestingWallets.push(vestingWallet);
        SafeERC20.safeTransfer(IERC20(vrsw), vestingWallet, amount);
        emit NewVesting(vestingWallet, beneficiary, startTs, duration);
    }

    function setAllocationPoints(
        address[] calldata _stakers,
        uint256[] calldata _allocationPoints
    ) external override onlyOwner {
        uint256 totalAllocationPoints;
        StakerInfo memory stakerInfo;
        address _stakerFactory = stakerFactory;
        for (uint256 i = 0; i < _stakers.length; ++i) {
            require(
                IvStakerFactory(_stakerFactory).stakers(
                    IvStaker(_stakers[i]).lpToken()
                ) == _stakers[i],
                'invalid staker'
            );
            totalAllocationPoints += _allocationPoints[i];
        }

        for (uint256 i = 0; i < _stakers.length; ++i) {
            stakerInfo = stakers[_stakers[i]];
            _updateStakerInfo(stakerInfo, allocationPoints[_stakers[i]]);
            stakers[_stakers[i]] = stakerInfo;
            allocationPoints[_stakers[i]] =
                (_allocationPoints[i] * ALLOCATION_POINTS_FACTOR) /
                totalAllocationPoints;
        }
    }

    function arbitraryTransfer(
        address to,
        uint256 amount
    ) external override onlyOwner {
        require(block.timestamp >= emissionStartTs, 'too early');
        require(amount <= unlockedBalance(), 'not enough unlocked tokens');
        SafeERC20.safeTransfer(IERC20(vrsw), to, amount);
    }

    function transferRewards(address to, uint256 amount) external override {
        require(block.timestamp >= emissionStartTs, 'too early');
        require(amount > 0, 'zero amount');
        require(
            IvStakerFactory(stakerFactory).stakers(
                IvStaker(msg.sender).lpToken()
            ) == msg.sender,
            'invalid staker'
        );

        StakerInfo memory stakerInfo = stakers[msg.sender];
        _updateStakerInfo(stakerInfo, allocationPoints[msg.sender]);

        require(
            amount <= stakerInfo.totalAllocated - stakerInfo.totalTransferred,
            'not enough tokens'
        );

        stakerInfo.totalTransferred += uint128(amount);
        stakers[msg.sender] = stakerInfo;
        algorithmicEmissionBalance -= amount;
        SafeERC20.safeTransfer(IERC20(vrsw), to, amount);
        emit TransferRewards(to, amount);
    }

    function mintGVrsw(address to, uint256 amount) external override {
        require(amount > 0, 'zero amount');
        require(
            IvStakerFactory(stakerFactory).stakers(
                IvStaker(msg.sender).lpToken()
            ) == msg.sender,
            'invalid staker'
        );
        gVrsw.mint(to, amount);
    }

    function burnGVrsw(address to, uint256 amount) external override {
        require(amount > 0, 'zero amount');
        require(
            IvStakerFactory(stakerFactory).stakers(
                IvStaker(msg.sender).lpToken()
            ) == msg.sender,
            'invalid staker'
        );
        gVrsw.burn(to, amount);
    }

    function calculateTokensForStaker(
        address staker
    ) external view override returns (uint256) {
        StakerInfo memory stakerInfo = stakers[staker];
        _updateStakerInfo(stakerInfo, allocationPoints[staker]);
        return stakerInfo.totalAllocated;
    }

    function calculateCompoundRateForStaker(
        address staker
    ) external view override returns (uint256) {
        StakerInfo memory stakerInfo = stakers[staker];
        _updateStakerInfo(stakerInfo, allocationPoints[staker]);
        return stakerInfo.totalCompoundRate;
    }

    function unlockedBalance() public view returns (uint256) {
        return
            IERC20(vrsw).balanceOf(address(this)) -
            algorithmicEmissionBalance -
            EmissionMath.currentlyLockedForProject(emissionStartTs);
    }

    function _updateStakerInfo(
        StakerInfo memory stakerInfo,
        uint256 _allocationPoints
    ) private view {
        if (
            stakerInfo.lastUpdated > 0 &&
            block.timestamp > stakerInfo.lastUpdated
        ) {
            stakerInfo.totalCompoundRate +=
                (EmissionMath.calculateCompoundRate(
                    stakerInfo.lastUpdated - emissionStartTs,
                    block.timestamp - emissionStartTs,
                    IvTokenomicsParams(tokenomicsParams).r()
                ) * uint128(_allocationPoints)) /
                ALLOCATION_POINTS_FACTOR;
            stakerInfo.totalAllocated +=
                (EmissionMath.calculateAlgorithmicEmission(
                    stakerInfo.lastUpdated - emissionStartTs,
                    block.timestamp - emissionStartTs
                ) * uint128(_allocationPoints)) /
                ALLOCATION_POINTS_FACTOR;
        }
        stakerInfo.lastUpdated = uint128(
            Math.max(block.timestamp, emissionStartTs)
        );
    }
}
