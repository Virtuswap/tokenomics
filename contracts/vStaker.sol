// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {SD59x18, sd, unwrap, exp, UNIT, ZERO} from '@prb/math/src/SD59x18.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';
import './types.sol';
import './interfaces/IvStaker.sol';
import './interfaces/IvChainMinter.sol';
import './interfaces/IvTokenomicsParams.sol';

contract vStaker is IvStaker {
    /**
     * @dev The amount of LP tokens staked by each user.
     */
    mapping(address => SD59x18) public lpStake;

    /**
     * @dev The compound rate of each user.
     */
    mapping(address => SD59x18) public compoundRate;

    /**
     * @dev The mu value of each user's stake. You can learn more about mu and
     * staking formula in Virtuswap Tokenomics Whitepaper.
     */
    mapping(address => SD59x18) public mu;

    /**
     * @dev The reward points earned by each user.
     */
    mapping(address => SD59x18) public rewardPoints;

    /**
     * @dev The amount of rewards claimed by each user.
     */
    mapping(address => SD59x18) public rewardsClaimed;

    /**
     * @dev The VRSW stakes of each user.
     */
    mapping(address => Stake[]) public stakes;

    /**
     * @dev Sum of all user's mu values.
     */
    SD59x18 public totalMu;

    /**
     * @dev Sum of all user's reward points.
     */
    SD59x18 public totalRewardPoints;

    /**
     * @dev The compound rate for the whole staker.
     */
    SD59x18 public compoundRateGlobal;

    /**
     * @dev The total amount of VRSW tokens available for distribution as rewards.
     */
    SD59x18 public totalVrswAvailable;

    // lp token address
    address public immutable lpToken;

    // minter address
    address public immutable minter;

    // VRSW token address
    address public immutable vrswToken;

    // tokenomics params address
    address public immutable tokenomicsParams;

    // start of VRSW emission in seconds
    uint256 public immutable emissionStartTs;

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
        emissionStartTs = IvChainMinter(minter).emissionStartTs();
    }

    /// @inheritdoc IvStaker
    function stakeVrsw(uint256 amount) external override {
        require(amount > 0, 'insufficient amount');
        require(block.timestamp >= emissionStartTs, 'too early');

        _updateStateBefore(msg.sender);
        _stakeUnlocked(msg.sender, amount);
        _updateStateAfter(msg.sender);

        SafeERC20.safeTransferFrom(
            IERC20(vrswToken),
            msg.sender,
            address(this),
            amount
        );
        IvChainMinter(minter).mintGVrsw(msg.sender, amount);
        emit StakeVrsw(msg.sender, amount);
    }

    /// @inheritdoc IvStaker
    function stakeLp(uint256 amount) external override {
        require(lpToken != address(0), 'can stake only vrsw');
        require(amount > 0, 'zero amount');
        require(block.timestamp >= emissionStartTs, 'too early');

        _updateStateBefore(msg.sender);
        lpStake[msg.sender] = lpStake[msg.sender].add(sd(int256(amount)));
        _updateStateAfter(msg.sender);

        SafeERC20.safeTransferFrom(
            IERC20(lpToken),
            msg.sender,
            address(this),
            amount
        );
        emit StakeLp(msg.sender, amount);
    }

    /// @inheritdoc IvStaker
    function claimRewards() external override {
        require(block.timestamp >= emissionStartTs, 'too early');
        _updateStateBefore(msg.sender);
        uint256 amountToClaim = _calculateAccruedRewards(msg.sender, true);
        rewardsClaimed[msg.sender] = rewardsClaimed[msg.sender].add(
            sd(int256(amountToClaim))
        );
        _updateStateAfter(msg.sender);

        if (amountToClaim > 0) {
            IvChainMinter(minter).transferRewards(msg.sender, amountToClaim);
        }
        emit RewardsClaimed(msg.sender, amountToClaim);
    }

    /// @inheritdoc IvStaker
    function viewRewards(
        address who
    ) external view override returns (uint256 rewards) {
        rewards = _calculateAccruedRewards(who, false);
    }

    /// @inheritdoc IvStaker
    function viewStakes()
        external
        view
        override
        returns (Stake[] memory _stakes)
    {
        _stakes = stakes[msg.sender];
    }

    /// @inheritdoc IvStaker
    function unstakeLp(uint256 amount) external override {
        require(lpToken != address(0), 'can stake only vrsw');
        require(block.timestamp >= emissionStartTs, 'too early');
        require(
            int256(amount) <= unwrap(lpStake[msg.sender]) && amount > 0,
            'insufficient amount'
        );
        _updateStateBefore(msg.sender);
        lpStake[msg.sender] = lpStake[msg.sender].sub(sd(int256(amount)));
        _updateStateAfter(msg.sender);

        SafeERC20.safeTransfer(IERC20(lpToken), msg.sender, amount);

        emit UnstakeLp(msg.sender, amount);
    }

    /// @inheritdoc IvStaker
    function unstakeVrsw(uint256 amount) external override {
        require(block.timestamp >= emissionStartTs, 'too early');
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
        IvChainMinter(minter).burnGVrsw(msg.sender, amount);

        emit UnstakeVrsw(msg.sender, amount);
    }

    /// @inheritdoc IvStaker
    function lockVrsw(uint256 amount, uint256 lockDuration) external override {
        require(block.timestamp >= emissionStartTs, 'too early');
        Stake[] storage senderStakes = stakes[msg.sender];
        if (senderStakes.length == 0) {
            senderStakes.push(Stake(0, 0, ZERO, ZERO));
        }

        require(amount > 0, 'insufficient amount');
        require(lockDuration > 0, 'insufficient lock duration');

        _updateStateBefore(msg.sender);
        _newStakePosition(amount, lockDuration);
        _updateStateAfter(msg.sender);

        SafeERC20.safeTransferFrom(
            IERC20(vrswToken),
            msg.sender,
            address(this),
            amount
        );
        IvChainMinter(minter).mintGVrsw(msg.sender, amount);
        emit LockVrsw(msg.sender, amount, lockDuration);
    }

    /// @inheritdoc IvStaker
    function lockStakedVrsw(
        uint256 amount,
        uint256 lockDuration
    ) external override {
        require(block.timestamp >= emissionStartTs, 'too early');
        Stake[] storage senderStakes = stakes[msg.sender];
        require(senderStakes.length > 0, 'no stakes');
        require(
            amount > 0 && amount <= uint256(unwrap(senderStakes[0].amount)),
            'insufficient amount'
        );
        require(lockDuration > 0, 'insufficient lock duration');

        _updateStateBefore(msg.sender);
        senderStakes[0].amount = senderStakes[0].amount.sub(sd(int256(amount)));
        _newStakePosition(amount, lockDuration);
        _updateStateAfter(msg.sender);
        emit LockStakedVrsw(msg.sender, amount, lockDuration);
    }

    /// @inheritdoc IvStaker
    function checkLock(
        address who
    ) external view override returns (uint[] memory unlockedPositions) {
        Stake[] storage userStakes = stakes[who];
        uint256 stakesLength = userStakes.length;
        uint256 unlockedPositionsNumber;
        for (uint256 i = 1; i < stakesLength; ++i) {
            if (
                userStakes[i].startTs + userStakes[i].lockDuration <=
                block.timestamp
            ) {
                ++unlockedPositionsNumber;
            }
        }
        unlockedPositions = new uint[](unlockedPositionsNumber);
        for (uint256 i = 1; i < stakesLength; ++i) {
            if (
                userStakes[i].startTs + userStakes[i].lockDuration <=
                block.timestamp
            ) {
                unlockedPositions[--unlockedPositionsNumber] = i;
            }
        }
    }

    /// @inheritdoc IvStaker
    function unlockVrsw(address who, uint256 position) external override {
        require(block.timestamp >= emissionStartTs, 'too early');
        require(position > 0, 'invalid position');

        Stake memory userStake = stakes[who][position];
        require(
            userStake.startTs + userStake.lockDuration <= block.timestamp,
            'locked'
        );

        uint256 vrswToUnlock = uint256(unwrap(userStake.amount));

        _updateStateBefore(who);
        stakes[who][position] = stakes[who][stakes[who].length - 1];
        stakes[who].pop();
        _stakeUnlocked(who, vrswToUnlock);
        _updateStateAfter(who);

        emit UnlockVrsw(who, vrswToUnlock);
    }

    /**
     * @dev Adds a new stake position for the staker
     * @param amount Amount of VRSW tokens to stake
     * @param lockDuration Duration of the lock period for the stake
     */
    function _newStakePosition(uint256 amount, uint256 lockDuration) private {
        Stake[] storage senderStakes = stakes[msg.sender];
        senderStakes.push(
            Stake(
                block.timestamp,
                lockDuration,
                exp(
                    IvTokenomicsParams(tokenomicsParams).r().mul(
                        sd(-int256(block.timestamp - emissionStartTs) * 1e18)
                    )
                ),
                sd(int256(amount))
            )
        );
    }

    /**
     * @dev Stakes VRSW after the lock has expired
     * @param who The staker address
     * @param amount Amount of VRSW tokens to stake
     */
    function _stakeUnlocked(address who, uint256 amount) private {
        Stake[] storage senderStakes = stakes[who];

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
    }

    /**
     * @dev Calculates the accrued rewards for the staker
     * @param who The staker address
     * @param isStateChanged Whether the global state was changed before this function call
     * @return The amount of accrued rewards
     */
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
            unwrap(_totalRewardPoints) == 0
                ? 0
                : uint256(
                    unwrap(
                        _senderRewardPoints
                            .mul(_totalVrswAvailable)
                            .div(_totalRewardPoints)
                            .sub(rewardsClaimed[who])
                    )
                );
    }

    /**
     * @dev Calculates the state of the staker before the update
     * @param who The staker address
     * Returns the total available VRSW tokens, the reward points of the staker, the total reward points,
     *         the compound rate of the staker, and the global compound rate
     */
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
                    IvChainMinter(minter).calculateTokensForStaker(
                        address(this)
                    )
                )
            )
        );
        _compoundRateGlobal = sd(
            int256(
                uint256(
                    IvChainMinter(minter).calculateCompoundRateForStaker(
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

    /**
     * @dev Updates the state of the staker before the update
     * @param who The staker address
     */
    function _updateStateBefore(address who) private {
        (
            totalVrswAvailable,
            rewardPoints[who],
            totalRewardPoints,
            compoundRate[who],
            compoundRateGlobal
        ) = _calculateStateBefore(who);
    }

    /**
     * @dev Updates the state of the staker after the update
     * @param who The staker address
     */
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
        SD59x18 muNew = (
            lpToken == address(0)
                ? UNIT
                : lpStake[who].pow(IvTokenomicsParams(tokenomicsParams).alpha())
        ).mul(mult.pow(IvTokenomicsParams(tokenomicsParams).beta()));
        totalMu = totalMu.add(muNew.sub(mu[who]));
        mu[who] = muNew;
    }
}
