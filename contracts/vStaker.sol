// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {SD59x18, sd, unwrap, exp, UNIT, ZERO} from '@prb/math/src/SD59x18.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';
import './types.sol';
import './Vrsw.sol';
import './GVrsw.sol';
import './interfaces/IvStaker.sol';
import './interfaces/IvMinter.sol';

contract vStaker is IvStaker {
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
    mapping(address => uint256) public firstUnlockTs;

    SD59x18 totalMu;
    SD59x18 totalRewardPoints;
    SD59x18 compoundRateGlobal;
    SD59x18 totalVrswAvailable;

    address public immutable lpToken;
    Vrsw public immutable vrswToken;
    gVrsw public immutable gVrswToken;
    address public immutable minter;

    constructor(
        address _lpToken,
        address _vrswToken,
        address _gVrswToken,
        address _minter
    ) {
        lpToken = _lpToken;
        vrswToken = Vrsw(_vrswToken);
        gVrswToken = gVrsw(_gVrswToken);
        minter = _minter;
    }

    function stakeVrsw(uint256 amount) external override {
        require(amount > 0, 'insufficient amount');

        uint256 emissionStartTs = IvMinter(minter).emissionStartTs();
        require(block.timestamp >= emissionStartTs, 'too early');

        _updateStateBefore(msg.sender);

        Stake[] storage senderStakes = stakes[msg.sender];

        if (senderStakes.length == 0) {
            senderStakes.push(Stake(0, 0, ZERO, ZERO));
        }

        Stake memory oldStake = senderStakes[0];

        senderStakes[0] = Stake(
            block.timestamp,
            0,
            oldStake
                .amount
                .mul(oldStake.discountFactor)
                .add(
                    sd(int256(amount)).mul(
                        exp(
                            r.mul(
                                sd(
                                    -int256(block.timestamp - emissionStartTs) *
                                        1e18
                                )
                            )
                        )
                    )
                )
                .div(oldStake.amount.add(sd(int256(amount)))),
            oldStake.amount.add(sd(int256(amount)))
        );

        _updateStateAfter(msg.sender);

        SafeERC20.safeTransferFrom(
            IERC20(vrswToken),
            msg.sender,
            address(this),
            amount
        );
        gVrswToken.mint(msg.sender, amount);
    }

    function stakeLp(uint256 amount) external override {
        require(amount > 0, 'zero amount');

        _updateStateBefore(msg.sender);
        lpStake[msg.sender] = lpStake[msg.sender].add(sd(int256(amount)));
        _updateStateAfter(msg.sender);

        SafeERC20.safeTransferFrom(
            IERC20(lpToken),
            msg.sender,
            address(this),
            amount
        );
    }

    function claimRewards() external override {
        _updateStateBefore(msg.sender);
        uint256 amountToClaim = _calculateAccruedRewards(msg.sender, true);
        rewardsClaimed[msg.sender] = rewardsClaimed[msg.sender].add(
            sd(int256(amountToClaim))
        );
        _updateStateAfter(msg.sender);

        if (amountToClaim > 0) {
            SafeERC20.safeTransfer(
                IERC20(vrswToken),
                msg.sender,
                amountToClaim
            );
        }
    }

    function viewRewards(
        address who
    ) external view override returns (uint256 rewards) {
        rewards = _calculateAccruedRewards(who, false);
    }

    function viewStakes()
        external
        view
        override
        returns (Stake[] memory _stakes)
    {
        _stakes = stakes[msg.sender];
    }

    function unstakeLp(uint256 amount) external override {
        require(
            int256(amount) <= unwrap(lpStake[msg.sender]) && amount > 0,
            'insufficient amount'
        );
        _updateStateBefore(msg.sender);
        lpStake[msg.sender] = lpStake[msg.sender].sub(sd(int256(amount)));
        _updateStateAfter(msg.sender);

        SafeERC20.safeTransfer(IERC20(lpToken), msg.sender, amount);
    }

    function unstakeVrsw(uint256 amount) external override {
        Stake[] storage senderStakes = stakes[msg.sender];
        require(senderStakes.length > 0, 'no stakes');
        require(
            amount > 0 && amount <= uint256(unwrap(senderStakes[0].amount)),
            'insufficient amount'
        );

        _updateStateBefore(msg.sender);
        senderStakes[0].amount = senderStakes[0].amount.sub(sd(int256(amount)));
        _updateStateAfter(msg.sender);

        SafeERC20.safeTransfer(IERC20(vrswToken), msg.sender, amount);
        gVrswToken.burn(msg.sender, amount);
    }

    function lockVrsw(uint256 amount, uint256 lockDuration) external override {
        Stake[] storage senderStakes = stakes[msg.sender];
        if (senderStakes.length == 0) {
            senderStakes.push(Stake(0, 0, ZERO, ZERO));
        }

        require(amount > 0, 'insufficient amount');
        require(lockDuration > 0, 'insufficient lock duration');

        _updateStateBefore(msg.sender);
        _newStakePosition(msg.sender, amount, lockDuration);
        _updateStateAfter(msg.sender);

        SafeERC20.safeTransferFrom(
            IERC20(vrswToken),
            msg.sender,
            address(this),
            amount
        );
        gVrswToken.mint(msg.sender, amount);
    }

    function lockStakedVrsw(
        uint256 amount,
        uint256 lockDuration
    ) external override {
        Stake[] storage senderStakes = stakes[msg.sender];
        require(senderStakes.length > 0, 'no stakes');
        require(
            amount > 0 && amount <= uint256(unwrap(senderStakes[0].amount)),
            'insufficient amount'
        );
        require(lockDuration > 0, 'insufficient lock duration');

        _updateStateBefore(msg.sender);
        senderStakes[0].amount = senderStakes[0].amount.sub(sd(int256(amount)));
        _newStakePosition(msg.sender, amount, lockDuration);
        _updateStateAfter(msg.sender);
    }

    function checkLock(
        address who
    ) external view override returns (bool isUnlocked) {
        isUnlocked =
            firstUnlockTs[who] > 0 &&
            firstUnlockTs[who] < block.timestamp;
    }

    function withdrawUnlockedVrsw(address who) external override {
        _updateStateBefore(who);
        Stake[] storage userStakes = stakes[who];
        uint256 nextUnlockTs = (1 << 256) - 1;
        uint256 vrswToWithdraw = 0;
        uint256 lastIndex = userStakes.length - 1;
        for (uint i = lastIndex; i > 0; --i) {
            if (
                userStakes[i].startTs + userStakes[i].lockDuration <
                block.timestamp
            ) {
                vrswToWithdraw += uint256(unwrap(userStakes[i].amount));
                userStakes[i] = userStakes[lastIndex--];
                userStakes.pop();
            } else {
                nextUnlockTs = Math.min(
                    nextUnlockTs,
                    userStakes[i].lockDuration + userStakes[i].startTs
                );
            }
        }
        firstUnlockTs[who] = (
            nextUnlockTs == (1 << 256) - 1 ? 0 : nextUnlockTs
        );
        _updateStateAfter(who);
        if (vrswToWithdraw > 0) {
            SafeERC20.safeTransfer(IERC20(vrswToken), who, vrswToWithdraw);
            gVrswToken.burn(who, vrswToWithdraw);
        }
    }

    function _newStakePosition(
        address who,
        uint256 amount,
        uint256 lockDuration
    ) private {
        Stake[] storage senderStakes = stakes[who];
        senderStakes.push(
            Stake(
                block.timestamp,
                lockDuration,
                exp(
                    r.mul(
                        sd(
                            -int256(
                                block.timestamp -
                                    IvMinter(minter).emissionStartTs()
                            )
                        )
                    )
                ),
                sd(int256(amount))
            )
        );
        firstUnlockTs[who] = Math.min(
            firstUnlockTs[who],
            block.timestamp + lockDuration
        );
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
                    rewardPoints[who],
                    totalRewardPoints,
                    compoundRate[who],
                    compoundRateGlobal
                )
                : _calculateStateBefore(who);
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

    function _calculateStateBefore(
        address who
    )
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
        _totalVrswAvailable = sd(
            int256(
                uint256(
                    IvMinter(minter).calculateTokensForStaker(address(this))
                )
            )
        );
        _compoundRateGlobal = sd(
            int256(
                uint256(
                    IvMinter(minter).calculateCompoundRateForStaker(
                        address(this)
                    )
                )
            )
        );
        SD59x18 deltaCompoundRate = _compoundRateGlobal.sub(compoundRate[who]);
        SD59x18 deltaCompoundRateGlobal = _compoundRateGlobal.sub(
            compoundRateGlobal
        );
        _senderRewardPoints = rewardPoints[who].add(
            mu[who].mul(deltaCompoundRate)
        );
        _totalRewardPoints = totalRewardPoints.add(
            totalMu.mul(deltaCompoundRateGlobal)
        );
        _senderCompoundRate = compoundRate[who].add(deltaCompoundRate);
    }

    function _updateStateBefore(address who) private {
        (
            totalVrswAvailable,
            rewardPoints[who],
            totalRewardPoints,
            compoundRate[who],
            compoundRateGlobal
        ) = _calculateStateBefore(who);
    }

    function _updateStateAfter(address who) private {
        Stake[] storage senderStakes = stakes[who];
        SD59x18 mult;
        uint256 stakesLength = senderStakes.length;
        for (uint256 i = 0; i < stakesLength; ++i) {
            mult = mult.add(
                senderStakes[i].amount.mul(senderStakes[i].discountFactor).mul(
                    UNIT.add(
                        b.mul(
                            sd(int256(senderStakes[i].lockDuration) * 1e18).pow(
                                gamma
                            )
                        )
                    )
                )
            );
        }
        mult = mult.add(UNIT);
        SD59x18 muNew = lpStake[who].pow(alpha).mul(mult.pow(beta));
        totalMu = totalMu.add(muNew.sub(mu[who]));
        mu[who] = muNew;
    }
}
