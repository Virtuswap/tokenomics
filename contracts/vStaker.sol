// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {SD59x18, sd, unwrap, exp, UNIT, ZERO} from '@prb/math/src/SD59x18.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';
import './types.sol';
import './interfaces/IvStaker.sol';
import './interfaces/IvMinter.sol';
import './interfaces/IvTokenomicsParams.sol';

contract vStaker is IvStaker {
    mapping(address => SD59x18) public lpStake;
    mapping(address => SD59x18) public compoundRate;
    mapping(address => SD59x18) public mu;
    mapping(address => SD59x18) public rewardPoints;
    mapping(address => SD59x18) public rewardsClaimed;
    mapping(address => Stake[]) public stakes;
    mapping(address => uint256) public firstUnlockTs;

    SD59x18 public totalMu;
    SD59x18 public totalRewardPoints;
    SD59x18 public compoundRateGlobal;
    SD59x18 public totalVrswAvailable;

    address public immutable lpToken;
    address public immutable minter;
    address public immutable vrswToken;
    address public immutable tokenomicsParams;

    constructor(
        address _lpToken,
        address _vrswToken,
        address _minter,
        address _tokenomicsParams
    ) {
        lpToken = _lpToken;
        minter = _minter;
        vrswToken = _vrswToken;
        tokenomicsParams = _tokenomicsParams;
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
                            IvTokenomicsParams(tokenomicsParams).r().mul(
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
        IvMinter(minter).mintGVrsw(msg.sender, amount);
    }

    function stakeLp(uint256 amount) external override {
        require(amount > 0, 'zero amount');
        require(
            block.timestamp >= IvMinter(minter).emissionStartTs(),
            'too early'
        );

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
        require(
            block.timestamp >= IvMinter(minter).emissionStartTs(),
            'too early'
        );
        _updateStateBefore(msg.sender);
        uint256 amountToClaim = _calculateAccruedRewards(msg.sender, true);
        rewardsClaimed[msg.sender] = rewardsClaimed[msg.sender].add(
            sd(int256(amountToClaim))
        );
        _updateStateAfter(msg.sender);

        if (amountToClaim > 0) {
            IvMinter(minter).transferRewards(msg.sender, amountToClaim);
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
            block.timestamp >= IvMinter(minter).emissionStartTs(),
            'too early'
        );
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
        require(
            block.timestamp >= IvMinter(minter).emissionStartTs(),
            'too early'
        );
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
        IvMinter(minter).burnGVrsw(msg.sender, amount);
    }

    function lockVrsw(uint256 amount, uint256 lockDuration) external override {
        require(
            block.timestamp >= IvMinter(minter).emissionStartTs(),
            'too early'
        );
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
        IvMinter(minter).mintGVrsw(msg.sender, amount);
    }

    function lockStakedVrsw(
        uint256 amount,
        uint256 lockDuration
    ) external override {
        require(
            block.timestamp >= IvMinter(minter).emissionStartTs(),
            'too early'
        );
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
        require(
            block.timestamp >= IvMinter(minter).emissionStartTs(),
            'too early'
        );
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
            IvMinter(minter).burnGVrsw(msg.sender, vrswToWithdraw);
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
                    IvTokenomicsParams(tokenomicsParams).r().mul(
                        sd(
                            -int256(
                                block.timestamp -
                                    IvMinter(minter).emissionStartTs()
                            ) * 1e18
                        )
                    )
                ),
                sd(int256(amount))
            )
        );
        uint256 unlockTs = block.timestamp + lockDuration;
        uint256 _firstUnlockTs = firstUnlockTs[who];
        firstUnlockTs[who] = _firstUnlockTs == 0
            ? unlockTs
            : Math.min(_firstUnlockTs, unlockTs);
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
                        IvTokenomicsParams(tokenomicsParams).b().mul(
                            sd(int256(senderStakes[i].lockDuration) * 1e18).pow(
                                IvTokenomicsParams(tokenomicsParams).gamma()
                            )
                        )
                    )
                )
            );
        }
        mult = mult.add(UNIT);
        SD59x18 muNew = lpStake[who]
            .pow(IvTokenomicsParams(tokenomicsParams).alpha())
            .mul(mult.pow(IvTokenomicsParams(tokenomicsParams).beta()));
        totalMu = totalMu.add(muNew.sub(mu[who]));
        mu[who] = muNew;
    }
}
