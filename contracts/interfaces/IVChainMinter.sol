// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

/**
 * @title Interface for vChainMinter contract, which handles VRSW and veVRSW tokens distribution
 * among stakers.
 */
interface IVChainMinter {
    /**
     * @notice Emitted when a new stakeris set.
     * @param stakerAddress is the address of the new staker factory.
     */
    event NewStaker(address stakerAddress);

    /**
     * @notice Emitted when rewards are transferred to an address.
     * @param to The address receiving the rewards.
     * @param pool The address of pool for staking in which the rewards are transferred.
     * @param amount The amount of rewards transferred.
     */
    event TransferRewards(
        address indexed to,
        address indexed pool,
        uint256 amount
    );

    /**
     * @notice Changes minting epoch duration and preparation time.
     * @param _epochDuration The duration (in seconds) of the epoch starting from the next
     * @param _epochPreparationTime The time (in seconds) before the next epoch for transfering
     * tokens.
     *
     * Requirements:
     * - The caller must be the owner of the contract.
     */
    function setEpochParams(
        uint32 _epochDuration,
        uint32 _epochPreparationTime
    ) external;

    /**
     * @notice Accepts necessary amount of VRSW tokens for the
     * next mining epoch according to the schedule defined in EmissionMath library.
     * Currently the transfers are done manually using intermediary wallet (contracts owner).
     * @param nextBalance Amount of VRSW tokens for the next epoch.
     *
     * Requirements:
     * - The caller must be the owner of the contract.
     */
    function prepareForNextEpoch(uint256 nextBalance) external;

    /**
     * @dev Sets the allocation points for a list of pools.
     *
     * This function allows the owner of the contract to set the allocation points
     * for a list of pools, which determines their share of the total rewards
     * distributed by the contract. The total allocation points must be non-zero,
     * and each pool must be registered in Virtuswap pairs factory.
     *
     * @param pools The addresses of the pools to set the allocation points for.
     * @param allocationPoints The allocation points to set for each staker.
     *
     * Requirements:
     * - The caller must be the owner of the contract.
     */
    function setAllocationPoints(
        address[] calldata pools,
        uint256[] calldata allocationPoints
    ) external;

    /**
     * @notice Sets the address of the staker contract.
     * @dev Can be called only by owner.
     * @notice The staker factory can be set only once
     * @param _newStaker The address of the new staker contract.
     */
    function setStaker(address _newStaker) external;

    /**
     * @notice Returns the timestamp when VRSW emission began.
     * @return The timestamp when VRSW emission began.
     */
    function emissionStartTs() external view returns (uint256);

    /**
     * @notice Transfers a specified amount of VRSW tokens as a reward to a recipient.
     *
     * This function allows a registered staker to transfer a specified amount of
     * rewards tokens to a recipient address. The caller must be a registered staker,
     * and the current timestamp must be later than the contract's emission start time.
     *
     * @param to The address of the recipient to transfer tokens to.
     * @param amount The amount of tokens to transfer.
     *
     * Requirements:
     * - The current timestamp must be later than the contract's emission start time.
     * - The amount to transfer must be greater than zero.
     */
    function transferRewards(address to, address pool, uint256 amount) external;

    /**
     * @notice Mint veVrsw tokens to the specified to address.
     * @param to The address to which the minted veVrsw tokens will be sent.
     * @param amount The amount of veVrsw tokens to be minted.
     * Requirements:
     * - amount must be greater than zero.
     * - The sender must be a valid staker.
     */
    function mintVeVrsw(address to, uint256 amount) external;

    /**
     * @notice Burn amount of veVrsw tokens from the specified to address.
     * @param from The address from which the veVrsw tokens will be burned.
     * @param amount The amount of veVrsw tokens to be burned.
     * Requirements:
     * - amount must be greater than zero.
     * - The sender must be a valid staker.
     */
    function burnVeVrsw(address from, uint256 amount) external;

    /**
     * @notice Triggers next epoch transition
     */
    function triggerEpochTransition() external;

    /**
     * @notice Calculates the amount of tokens a pool is eligible to receive from VRSW algorithmic emission.
     * @param pool The address of the staker pool.
     * @return The amount of tokens the pool is eligible to receive.
     */
    function calculateTokensForPool(
        address pool
    ) external view returns (uint256);
}
