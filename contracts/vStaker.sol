// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {SD59x18, sd, exp, UNIT} from '@prb/math/src/SD59x18.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './types.sol';
import './interfaces/IvStaker.sol';

contract vStaker is IvStaker {
    SD59x18 public constant V = SD59x18.wrap(2.3762e18);
    SD59x18 public constant v = SD59x18.wrap(-7.069557693e9);
    SD59x18 public constant r = SD59x18.wrap(0.01e18);
    SD59x18 public constant b = SD59x18.wrap(0.01e18);
    SD59x18 public constant alpha = SD59x18.wrap(1e18);
    SD59x18 public constant beta = SD59x18.wrap(0.5e18);
    SD59x18 public constant gamma = SD59x18.wrap(1e18);

    mapping(address => SD59x18) public lpStake;
    mapping(address => SD59x18) public compoundRate;
    mapping(address => SD59x18) public mu;
    mapping(address => SD59x18) public rewardPoints;
    mapping(address => Stake[]) public stakes;

    SD59x18 totalMu;
    SD59x18 totalRewardPoints;
    SD59x18 compoundRateGlobal;
    SD59x18 totalVrswAvailable;
    uint256 startTimestamp;
    uint256 allocationPointsPct;

    address public immutable lpToken;

    constructor(address _lpToken) {
        lpToken = _lpToken;
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

    function claimRewards() external override {}

    function viewRewards() external view override returns (uint256 rewards) {}

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
        uint256 newAllocationPoints
    ) external override {}

    function _updateStateBefore() private {
        totalVrswAvailable = totalVrswAvailable
            .add(_calculateAlgorithmicVrswEmission(sd(0)))
            .sub(totalVrswAvailable);
        SD59x18 algoEmissionR = _calculateAlgorithmicVrswEmission(r);
        SD59x18 deltaCompoundRate = algoEmissionR.sub(compoundRate[msg.sender]);
        SD59x18 deltaCompoundRateGlobal = algoEmissionR.sub(compoundRateGlobal);
        rewardPoints[msg.sender] = rewardPoints[msg.sender].add(
            mu[msg.sender].mul(deltaCompoundRate)
        );
        totalRewardPoints = totalRewardPoints.add(
            totalMu.mul(deltaCompoundRateGlobal)
        );
        compoundRate[msg.sender] = compoundRate[msg.sender].add(
            deltaCompoundRate
        );
        compoundRateGlobal = compoundRateGlobal.add(deltaCompoundRateGlobal);
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
            .mul(sd(int256(allocationPointsPct * 1e16)))
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
