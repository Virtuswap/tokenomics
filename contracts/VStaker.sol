// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import {SD59x18, sd, unwrap, exp, UNIT, ZERO} from "@prb/math/src/SD59x18.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Types.sol";
import "./interfaces/IVStaker.sol";
import "./interfaces/IVChainMinter.sol";
import "./interfaces/IVTokenomicsParams.sol";

contract VStaker is IVStaker {
    /**
     * @dev The amount of LP tokens staked by each user.
     */
    mapping(address => SD59x18) public lpStake;

    /**
     * @dev The mu value of each user's stake. You can learn more about mu and
     * staking formula in Virtuswap Tokenomics Whitepaper.
     */
    mapping(address => SD59x18) public mu;

    mapping(address => SD59x18) public rewards;

    mapping(address => SD59x18) public rewardsCoefficient;

    /**
     * @dev The VRSW stakes of each user.
     */
    mapping(address => Stake[]) public stakes;

    /**
     * @dev Sum of all user's mu values.
     */
    SD59x18 public totalMu;

    SD59x18 public rewardsCoefficientGlobal;

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

    modifier notBefore(uint256 timestamp) {
        require(block.timestamp >= timestamp, "too early");
        _;
    }

    modifier positiveLockDuration(uint128 lockDuration) {
        require(lockDuration > 0, "insufficient lock duration");
        _;
    }

    modifier positiveAmount(uint256 amount) {
        require(amount > 0, "insufficient amount");
        _;
    }

    modifier notVrswOnlyPool() {
        require(lpToken != address(0), "can stake only vrsw");
        _;
    }

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
        emissionStartTs = IVChainMinter(minter).emissionStartTs();
    }

    /// @inheritdoc IVStaker
    function stakeVrsw(
        uint256 amount
    ) external override notBefore(emissionStartTs) positiveAmount(amount) {
        _updateStateBefore(msg.sender);
        _stakeUnlocked(msg.sender, amount);
        _updateStateAfter(msg.sender);

        SafeERC20.safeTransferFrom(
            IERC20(vrswToken),
            msg.sender,
            address(this),
            amount
        );
        IVChainMinter(minter).mintGVrsw(msg.sender, amount);
        emit StakeVrsw(msg.sender, amount);
    }

    /// @inheritdoc IVStaker
    function stakeLp(
        uint256 amount
    )
        external
        override
        notBefore(emissionStartTs)
        positiveAmount(amount)
        notVrswOnlyPool
    {
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

    /// @inheritdoc IVStaker
    function claimRewards() external override notBefore(emissionStartTs) {
        _updateStateBefore(msg.sender);
        uint256 amountToClaim = _calculateAccruedRewards(msg.sender, true);
        rewards[msg.sender] = ZERO;

        if (amountToClaim > 0) {
            IVChainMinter(minter).transferRewards(msg.sender, amountToClaim);
        }
        emit RewardsClaimed(msg.sender, amountToClaim);
    }

    /// @inheritdoc IVStaker
    function unstakeLp(
        uint256 amount
    )
        external
        override
        notBefore(emissionStartTs)
        positiveAmount(amount)
        notVrswOnlyPool
    {
        require(
            amount <= uint256(unwrap(lpStake[msg.sender])),
            "not enough tokens"
        );
        _updateStateBefore(msg.sender);
        lpStake[msg.sender] = lpStake[msg.sender].sub(sd(int256(amount)));
        _updateStateAfter(msg.sender);

        SafeERC20.safeTransfer(IERC20(lpToken), msg.sender, amount);

        emit UnstakeLp(msg.sender, amount);
    }

    /// @inheritdoc IVStaker
    function unstakeVrsw(
        uint256 amount
    ) external override notBefore(emissionStartTs) positiveAmount(amount) {
        Stake[] storage senderStakes = stakes[msg.sender];
        require(senderStakes.length > 0, "no stakes");
        require(
            amount <= uint256(unwrap(senderStakes[0].amount)),
            "not enough tokens"
        );

        _updateStateBefore(msg.sender);
        senderStakes[0].amount = senderStakes[0].amount.sub(sd(int256(amount)));
        _updateStateAfter(msg.sender);

        SafeERC20.safeTransfer(IERC20(vrswToken), msg.sender, amount);
        IVChainMinter(minter).burnGVrsw(msg.sender, amount);

        emit UnstakeVrsw(msg.sender, amount);
    }

    /// @inheritdoc IVStaker
    function lockVrsw(
        uint256 amount,
        uint128 lockDuration
    )
        external
        override
        notBefore(emissionStartTs)
        positiveLockDuration(lockDuration)
        positiveAmount(amount)
    {
        Stake[] storage senderStakes = stakes[msg.sender];
        if (senderStakes.length == 0) {
            senderStakes.push(Stake(0, 0, ZERO, ZERO));
        }

        _updateStateBefore(msg.sender);
        _newStakePosition(amount, lockDuration);
        _updateStateAfter(msg.sender);

        SafeERC20.safeTransferFrom(
            IERC20(vrswToken),
            msg.sender,
            address(this),
            amount
        );
        IVChainMinter(minter).mintGVrsw(msg.sender, amount);
        emit LockVrsw(msg.sender, amount, lockDuration);
    }

    /// @inheritdoc IVStaker
    function lockStakedVrsw(
        uint256 amount,
        uint128 lockDuration
    )
        external
        override
        notBefore(emissionStartTs)
        positiveLockDuration(lockDuration)
        positiveAmount(amount)
    {
        Stake[] storage senderStakes = stakes[msg.sender];
        require(senderStakes.length > 0, "no stakes");
        require(
            amount <= uint256(unwrap(senderStakes[0].amount)),
            "not enough tokens"
        );

        _updateStateBefore(msg.sender);
        senderStakes[0].amount = senderStakes[0].amount.sub(sd(int256(amount)));
        _newStakePosition(amount, lockDuration);
        _updateStateAfter(msg.sender);
        emit LockStakedVrsw(msg.sender, amount, lockDuration);
    }

    /// @inheritdoc IVStaker
    function unlockVrsw(
        address who,
        uint256 position
    ) external override notBefore(emissionStartTs) {
        require(position > 0, "invalid position");
        require(who != address(0), "zero address");

        Stake memory userStake = stakes[who][position];
        require(
            userStake.startTs + userStake.lockDuration <= block.timestamp,
            "locked"
        );

        uint256 vrswToUnlock = uint256(unwrap(userStake.amount));

        _updateStateBefore(who);
        stakes[who][position] = stakes[who][stakes[who].length - 1];
        stakes[who].pop();
        _stakeUnlocked(who, vrswToUnlock);
        _updateStateAfter(who);

        emit UnlockVrsw(who, vrswToUnlock);
    }

    /// @inheritdoc IVStaker
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

    /// @inheritdoc IVStaker
    function viewRewards(address who) external view override returns (uint256) {
        return _calculateAccruedRewards(who, false);
    }

    /// @inheritdoc IVStaker
    function viewStakes()
        external
        view
        override
        returns (Stake[] memory _stakes)
    {
        _stakes = stakes[msg.sender];
    }

    /**
     * @dev Adds a new stake position for the staker
     * @param amount Amount of VRSW tokens to stake
     * @param lockDuration Duration of the lock period for the stake
     */
    function _newStakePosition(uint256 amount, uint128 lockDuration) private {
        Stake[] storage senderStakes = stakes[msg.sender];
        senderStakes.push(
            Stake(
                uint128(block.timestamp),
                lockDuration,
                exp(
                    IVTokenomicsParams(tokenomicsParams).r().mul(
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
            uint128(block.timestamp),
            0,
            oldStake
                .amount
                .mul(oldStake.discountFactor)
                .add(
                    sd(int256(amount)).mul(
                        exp(
                            IVTokenomicsParams(tokenomicsParams).r().mul(
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
     * @dev Updates the state of the staker before the update
     * @param who The staker address
     */
    function _updateStateBefore(address who) private {
        (
            totalVrswAvailable,
            rewardsCoefficient[who],
            rewardsCoefficientGlobal,
            rewards[who]
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
                        IVTokenomicsParams(tokenomicsParams).b().mul(
                            sd(
                                int256(uint256(senderStakes[i].lockDuration)) *
                                    1e18
                            ).pow(IVTokenomicsParams(tokenomicsParams).gamma())
                        )
                    )
                )
            );
        }
        mult = mult.add(UNIT);
        SD59x18 muNew = (
            lpToken == address(0)
                ? UNIT
                : lpStake[who].pow(IVTokenomicsParams(tokenomicsParams).alpha())
        ).mul(mult.pow(IVTokenomicsParams(tokenomicsParams).beta()));
        totalMu = totalMu.add(muNew.sub(mu[who]));
        mu[who] = muNew;
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
        (, , , SD59x18 _senderRewards) = isStateChanged
            ? (ZERO, ZERO, ZERO, rewards[who])
            : _calculateStateBefore(who);
        return uint256(unwrap(_senderRewards));
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
            SD59x18 _senderRewardsCoefficient,
            SD59x18 _rewardsCoefficientGlobal,
            SD59x18 _senderRewards
        )
    {
        _totalVrswAvailable = sd(
            int256(
                uint256(
                    IVChainMinter(minter).calculateTokensForStaker(
                        address(this)
                    )
                )
            )
        );
        _rewardsCoefficientGlobal = unwrap(totalMu) == 0
            ? ZERO
            : rewardsCoefficientGlobal.add(
                (_totalVrswAvailable.sub(totalVrswAvailable)).div(totalMu)
            );
        _senderRewardsCoefficient = _rewardsCoefficientGlobal;
        _senderRewards = rewards[who].add(
            mu[who].mul(_rewardsCoefficientGlobal.sub(rewardsCoefficient[who]))
        );
    }
}
