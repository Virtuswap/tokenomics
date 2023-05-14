// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../Types.sol";

/**
 * @title Interface for vStaker contract for staking VRSW and LP tokens.
 */
interface IVStaker {
    /**
     *@notice Emitted when who stakes amount of VRSW tokens.
     *@param who Address of the account that stakes the tokens.
     *@param amount Amount of VRSW tokens being staked.
     */
    event StakeVrsw(address indexed who, uint256 amount);

    /**
     *@notice Emitted when who stakes amount of LP tokens.
     *@param who Address of the account that stakes the tokens.
     *@param amount Amount of LP tokens being staked.
     */
    event StakeLp(address indexed who, uint256 amount);

    /**
     *@notice Emitted when who claims amount of accrued rewards.
     *@param who Address of the account that claims the rewards.
     *@param amount Amount of rewards being claimed.
     */
    event RewardsClaimed(address indexed who, uint256 amount);

    /**
     *@notice Emitted when who unstakes amount of LP tokens.
     *@param who Address of the account that unstakes the tokens.
     *@param amount Amount of LP tokens being unstaked.
     */
    event UnstakeLp(address indexed who, uint256 amount);

    /**
     *@notice Emitted when who unstakes amount of VRSW tokens.
     *@param who Address of the account that unstakes the tokens.
     *@param amount Amount of VRSW tokens being unstaked.
     */
    event UnstakeVrsw(address indexed who, uint256 amount);

    /**
     *@notice Emitted when who locks amount of VRSW tokens for lockDuration seconds.
     *@param who Address of the account that locks the tokens.
     *@param amount Amount of VRSW tokens being locked.
     *@param lockDuration Duration in seconds for which the tokens are locked.
     */
    event LockVrsw(address indexed who, uint256 amount, uint128 lockDuration);

    /**
     *@notice Emitted when who locks amount of staked VRSW tokens for lockDuration seconds.
     *@param who Address of the account that locks the tokens.
     *@param amount Amount of staked VRSW tokens being locked.
     *@param lockDuration Duration in seconds for which the tokens are locked.
     */
    event LockStakedVrsw(
        address indexed who,
        uint256 amount,
        uint128 lockDuration
    );

    /**
     *@notice Emitted when who unlocks amount of VRSW tokens.
     *@param who Address of the account that unlocks the tokens.
     *@param amount Amount of VRSW tokens being unlocked.
     */
    event UnlockVrsw(address indexed who, uint256 amount);

    /**
     * @notice Getter for lpToken of current staker.
     */
    function lpToken() external view returns (address);

    /**
     * @notice Stake VRSW tokens into the vStaker contract.
     * @param amount The amount of VRSW tokens to stake.
     */
    function stakeVrsw(uint256 amount) external;

    /**
     * @notice Stake LP tokens into the vStaker contract.
     * @param amount The amount of LP tokens to stake.
     */
    function stakeLp(uint256 amount) external;

    /**

@notice Allows a user to claim their accrued VRSW rewards. The user's accrued rewards are calculated using the
     *_calculateAccruedRewards function. The rewards claimed are transferred
     *to the user's address using the transferRewards function of the IvMinter contract.
*/
    function claimRewards() external;

    /**
     *@notice Returns the amount of VRSW rewards that a user has accrued but not yet claimed. The user's accrued rewards are
     *calculated using the _calculateAccruedRewards function.
     *@param who The address of the user to query for accrued rewards.
     *@return rewards The amount of VRSW rewards that the user has accrued but not yet claimed.
     */
    function viewRewards(address who) external view returns (uint256 rewards);

    /**

@notice Returns an array of Stake structures containing information about the user's VRSW stakes.
@return stakes An array of Stake structures containing information about the user's VRSW stakes.
*/
    function viewStakes() external view returns (Stake[] memory stakes);

    /**
     *@dev Allows the user to unstake LP tokens from the contract. The LP tokens are transferred back to the user's wallet.
     *@param amount The amount of LP tokens to unstake.
     */
    function unstakeLp(uint256 amount) external;

    /**
     *@notice Allows the user to lock VRSW tokens in the contract for a specified duration of time.
     *@param amount The amount of VRSW tokens to lock.
     *@param lockDuration The duration of time to lock the tokens for.
     */
    function lockVrsw(uint256 amount, uint128 lockDuration) external;

    /**
     * @notice Locks a specified amount of staked VRSW tokens for a specified duration.
     * @param amount The amount of VRSW tokens to lock.
     * @param lockDuration The duration to lock the tokens for, in seconds.
     */
    function lockStakedVrsw(uint256 amount, uint128 lockDuration) external;

    /**
     *@notice Allows the user to unstake VRSW tokens from the contract.
     *@param amount The amount of VRSW tokens to unstake.
     */
    function unstakeVrsw(uint256 amount) external;

    /**
     * @notice Checks for any stake positions that are currently unlocked
     * @param who The address of the user to check the stake positions for
     * @return unlockedPositions An array of indices of the unlocked stake positions
     */
    function checkLock(
        address who
    ) external view returns (uint[] memory unlockedPositions);

    /**
     *@notice Unlocks a previously locked VRSW stake position with expired lock duration.
     *@dev Unlocked tokens stay staked for a user.
     *@param who The address of the staker who owns the stake to unlock.
     *@param position The position of the stake to unlock.
     */
    function unlockVrsw(address who, uint256 position) external;
}
