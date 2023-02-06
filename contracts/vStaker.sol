// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {SD59x18, sd, unwrap, exp, UNIT} from '@prb/math/src/SD59x18.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './types.sol';
import './interfaces/IvStaker.sol';

contract vStaker is IvStaker {
    SD59x18 public constant V = SD59x18.wrap(2.3762e18);
    SD59x18 public constant v = SD59x18.wrap(-7.069557693e9);
    SD59x18 public constant r = SD59x18.wrap(3e9);
    SD59x18 public constant b = SD59x18.wrap(0.01e18);
    SD59x18 public constant alpha = SD59x18.wrap(1e18);
    SD59x18 public constant beta = SD59x18.wrap(0.5e18);
    SD59x18 public constant gamma = SD59x18.wrap(1e18);

    mapping(address => SD59x18) public lpStake;
    mapping(address => SD59x18) public compoundRate;
    mapping(address => SD59x18) public mu;
    mapping(address => SD59x18) public rewardPoints;
    mapping(address => SD59x18) public rewardsClaimed;
    mapping(address => Stake[]) public stakes;

    SD59x18 totalMu;
    SD59x18 totalRewardPoints;
    SD59x18 compoundRateGlobal;
    SD59x18 totalVrswAvailable;
    SD59x18 allocationPointsPct;
    uint256 startTimestamp;

    address public immutable lpToken;
    address public immutable rewardToken;

    constructor(address _lpToken, address _rewardToken) {
        lpToken = _lpToken;
        rewardToken = _rewardToken;
        startTimestamp = block.timestamp;
    }

    function stakeVrsw(uint256 amount, uint256 lockDuration) external override {
        /*
        _updateRewardPoints();
        
        Stake[] storage senderStakes = stakes[msg.sender];
        Stake memory newStake;

        if (freeStakeId[msg.sender] == 0) {
            senderStakes.push(Stake(
                0, 0, 0, 0, 0
            ));
            ++freeStakeId[msg.sender];
        }

        if (lockingDuration == 0) {
            // staking
            senderStakes[msg.sender][0] = _newVrswStakeWithoutLock();
        } else {
            // locking
        }
        newStake.lockDuration = lockDuration;
        //newStake.discountFactor = e^(-rx);
         */
    }

    function stakeLp(uint256 amount) external override {
        require(amount > 0, 'zero amount');

        _updateStateBefore();
        lpStake[msg.sender] = lpStake[msg.sender].add(sd(int256(amount)));
        _updateStateAfter();

        SafeERC20.safeTransferFrom(
            IERC20(lpToken),
            msg.sender,
            address(this),
            amount
        );
    }

    function claimRewards() external override {
        _updateStateBefore();
        uint256 amountToClaim = _calculateAccruedRewards(msg.sender, true);
        rewardsClaimed[msg.sender] = rewardsClaimed[msg.sender].add(
            sd(int256(amountToClaim))
        );
        if (amountToClaim > 0) {
            SafeERC20.safeTransfer(
                IERC20(rewardToken),
                msg.sender,
                amountToClaim
            );
        }
        _updateStateAfter();
    }

    function viewRewards() external view override returns (uint256 rewards) {
        rewards = _calculateAccruedRewards(msg.sender, false);
    }

    function viewStakes()
        external
        view
        override
        returns (Stake[] memory rewards)
    {}

    function unstakeLp(uint256 amount) external override {}

    function unstakeVrsw(address who) external override {}

    function lockVrsw(uint256 amount, uint256 lockDuration) external override {}

    function setAllocationPoints(
        uint256 newAllocationPointsPct
    ) external override {
        _updateStateBefore();
        allocationPointsPct = sd(int256(newAllocationPointsPct) * 1e16);
        _updateStateAfter();
    }

    function _calculateAccruedRewards(
        address who,
        bool isStateChanged
    ) private view returns (uint256) {
        (
            SD59x18 _totalVrswAvailable,
            SD59x18 _senderRewardPoints,
            SD59x18 _totalRewardPoints,
            ,

        ) = isStateChanged
                ? (
                    totalVrswAvailable,
                    rewardPoints[msg.sender],
                    totalRewardPoints,
                    compoundRate[msg.sender],
                    compoundRateGlobal
                )
                : _calculateStateBefore();
        return
            uint256(
                unwrap(
                    _senderRewardPoints
                        .mul(_totalVrswAvailable)
                        .div(_totalRewardPoints)
                        .sub(rewardsClaimed[who])
                )
            );
    }

    function _calculateStateBefore()
        private
        view
        returns (
            SD59x18 _totalVrswAvailable,
            SD59x18 _senderRewardPoints,
            SD59x18 _totalRewardPoints,
            SD59x18 _senderCompoundRate,
            SD59x18 _compoundRateGlobal
        )
    {
        _totalVrswAvailable = _calculateAlgorithmicVrswEmission(sd(0));
        SD59x18 algoEmissionR = _calculateAlgorithmicVrswEmission(r);
        SD59x18 deltaCompoundRate = algoEmissionR.sub(compoundRate[msg.sender]);
        SD59x18 deltaCompoundRateGlobal = algoEmissionR.sub(compoundRateGlobal);
        _senderRewardPoints = rewardPoints[msg.sender].add(
            mu[msg.sender].mul(deltaCompoundRate)
        );
        _totalRewardPoints = totalRewardPoints.add(
            totalMu.mul(deltaCompoundRateGlobal)
        );
        _senderCompoundRate = compoundRate[msg.sender].add(deltaCompoundRate);
        _compoundRateGlobal = compoundRateGlobal.add(deltaCompoundRateGlobal);
    }

    function _updateStateBefore() private {
        (
            totalVrswAvailable,
            rewardPoints[msg.sender],
            totalRewardPoints,
            compoundRate[msg.sender],
            compoundRateGlobal
        ) = _calculateStateBefore();
    }

    function _updateStateAfter() private {
        Stake[] storage senderStakes = stakes[msg.sender];
        SD59x18 mult;
        uint256 stakesLength = senderStakes.length;
        for (uint256 i = 0; i < stakesLength; ++i) {
            mult = mult.add(
                sd(int256(senderStakes[i].amount))
                    .mul(senderStakes[i].discountFactor)
                    .mul(
                        UNIT.add(
                            b.mul(
                                sd(int256(senderStakes[i].lockDuration)).pow(
                                    gamma
                                )
                            )
                        )
                    )
            );
        }
        mult = mult.add(UNIT);
        SD59x18 muNew = lpStake[msg.sender].pow(alpha).mul(mult.pow(beta));
        totalMu = totalMu.add(muNew.sub(mu[msg.sender]));
        mu[msg.sender] = muNew;
    }

    function _calculateAlgorithmicVrswEmission(
        SD59x18 _r
    ) private view returns (SD59x18 amount) {
        amount = V
            .mul(allocationPointsPct)
            .mul(
                exp(
                    _r.add(v).mul(
                        sd(int256(block.timestamp - startTimestamp) * 1e18)
                    )
                ).sub(UNIT)
            )
            .div(_r.add(v));
    }
}
