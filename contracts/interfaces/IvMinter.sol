// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
@title Interface for vMinter contract, which handles VRSW and gVRSW tokens distribution.
*/
interface IvMinter {
    /**
     * @notice Emitted when a new staker factory is set.
     * @param stakerFactoryAddress is the address of the new staker factory.
     */
    event NewStakerFactory(address stakerFactoryAddress);

    /**
     * @notice Emitted when a new vVestingWallet contract is created.
     * @param vestingWallet The address of the vesting wallet.
     * @param beneficiary The address of the beneficiary of the vesting contract.
     * @param startTs The start timestamp of the vesting contract.
     * @param duration The duration of the vesting contract.
     */
    event NewVesting(
        address vestingWallet,
        address beneficiary,
        uint256 startTs,
        uint256 duration
    );

    /**
     * @notice Emitted when rewards are transferred to an address.
     * @param to The address receiving the rewards.
     * @param amount The amount of rewards transferred.
     */
    event TransferRewards(address to, uint256 amount);

    /**
     * @notice Creates a new vVestingWallet contract for the given beneficiary.
     * @dev Can be called only by owner.
     * @param beneficiary The address of the beneficiary of the vesting contract.
     * @param startTs The start timestamp of the vesting contract.
     * @param duration The duration of the vesting contract.
     * @param amount The amount of tokens to be vested.
     * @return vestingWallet The address of the new vesting wallet.
     *
     * Requirements:
     * - The caller must be the owner of the contract.
     */
    function newVesting(
        address beneficiary,
        uint256 startTs,
        uint256 duration,
        uint256 amount
    ) external returns (address vestingWallet);

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
     * @notice Transfers a specified amount of tokens to a recipient.
     *
     * This function allows the owner of the contract to transfer a specified
     * amount of unlocked tokens to a recipient address. The caller must be the
     * owner of the contract, and the current timestamp must be later than the
     * contract's emission start time.
     *
     * @param to The address of the recipient to transfer tokens to.
     * @param amount The amount of tokens to transfer.
     *
     * Requirements:
     * - The caller must be the owner of the contract.
     * - The current timestamp must be later than the contract's emission start time.
     * - The contract must have enough unlocked tokens to transfer.
     */
    function arbitraryTransfer(address to, uint256 amount) external;

    /**
     * @notice Returns the timestamp when VRSW emission began.
     * @return The timestamp when VRSW emission began.
     */
    function emissionStartTs() external view returns (uint256);

    /**
     * @notice Transfers a specified amount of VRSW tokens as a reward to a recipient.
     *
     * This function allows a registered staker to transfer a specified amount of
     * rewards tokens to a recipient address. The caller must be a registered staker
     * with a non-zero allocation point, and the current timestamp must be later
     * than the contract's emission start time. The staker must have enough untransferred
     * rewards tokens to transfer.
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
     *@notice Mint gVrsw tokens to the specified to address.
     *@param to The address to which the minted gVrsw tokens will be sent.
     *@param amount The amount of gVrsw tokens to be minted.
     *Requirements:
     *- amount must be greater than zero.
     *- The sender must be a valid staker.
     */
    function mintGVrsw(address to, uint256 amount) external;

    /**
     *@notice Burn amount of gVrsw tokens from the specified to address.
     *@param to The address from which the gVrsw tokens will be burned.
     *@param amount The amount of gVrsw tokens to be burned.
     *Requirements:
     * - amount must be greater than zero.
     * - The sender must be a valid staker.
     */
    function burnGVrsw(address to, uint256 amount) external;

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
