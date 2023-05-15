// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

/**
@title Interface for vChainMinter contract, which handles VRSW and gVRSW tokens distribution.
*/
interface IVChainMinter {
    /**
     * @notice Emitted when a new staker factory is set.
     * @param stakerFactoryAddress is the address of the new staker factory.
     */
    event NewStakerFactory(address stakerFactoryAddress);

    /**
     * @notice Emitted when rewards are transferred to an address.
     * @param to The address receiving the rewards.
     * @param amount The amount of rewards transferred.
     */
    event TransferRewards(address indexed to, uint256 amount);

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
     * @notice Accepts transfer of necessary amount of VRSW tokens for the
     * next mining epoch according to the schedule defined in EmissionMath library.
     * Currently the transfers are done manually using intermediary wallet (contracts owner).
     * @param nextBalance Amount of VRSW tokens for the next epoch.
     *
     * Requirements:
     * - The caller must be the owner of the contract.
     */
    function prepareForNextEpoch(uint256 nextBalance) external;

    /**
     * @dev Sets the allocation points for a list of stakers.
     *
     * This function allows the owner of the contract to set the allocation points
     * for a list of stakers, which determines their share of the total rewards
     * distributed by the contract. The total allocation points must be non-zero,
     * and each staker must be valid and registered with the associated staker
     * factory contract.
     *
     * @param stakers The addresses of the stakers to set the allocation points for.
     * @param allocationPoints The allocation points to set for each staker.
     *
     * Requirements:
     * - The caller must be the owner of the contract.
     */
    function setAllocationPoints(
        address[] calldata stakers,
        uint256[] calldata allocationPoints
    ) external;

    /**
     * @notice Sets the address of the staker factory contract.
     * @dev Can be called only by owner.
     * @param _newStakerFactory The address of the new staker factory contract.
     */
    function setStakerFactory(address _newStakerFactory) external;

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
     * The staker must have enough untransferred rewards tokens to transfer.
     *
     * @param to The address of the recipient to transfer tokens to.
     * @param amount The amount of tokens to transfer.
     *
     * Requirements:
     * - The current timestamp must be later than the contract's emission start time.
     * - The amount to transfer must be greater than zero.
     * - The caller must be a registered staker with a non-zero allocation point.
     * - The staker must have enough untransferred rewards tokens to transfer.
     */
    function transferRewards(address to, uint256 amount) external;

    /**
     * @notice Mint gVrsw tokens to the specified to address.
     * @param to The address to which the minted gVrsw tokens will be sent.
     * @param amount The amount of gVrsw tokens to be minted.
     * Requirements:
     * - amount must be greater than zero.
     * - The sender must be a valid staker.
     */
    function mintGVrsw(address to, uint256 amount) external;

    /**
     * @notice Burn amount of gVrsw tokens from the specified to address.
     * @param from The address from which the gVrsw tokens will be burned.
     * @param amount The amount of gVrsw tokens to be burned.
     * Requirements:
     * - amount must be greater than zero.
     * - The sender must be a valid staker.
     */
    function burnGVrsw(address from, uint256 amount) external;

    function triggerEpochTransition() external;

    /**
     * @notice Calculates the amount of tokens a staker is eligible to receive from VRSW algorithmic emission.
     * @param staker The address of the staker.
     * @return The amount of tokens the staker is eligible to receive.
     */
    function calculateTokensForStaker(
        address staker
    ) external view returns (uint256);

    /**
     * @notice Calculates the compound rate of a staker.
     * @param staker The address of the staker.
     * @return The compound rate of the staker.
     */
    function calculateCompoundRateForStaker(
        address staker
    ) external view returns (uint256);
}
