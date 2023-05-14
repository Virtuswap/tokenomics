// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @title IvStakerFactory
 * @notice Interface for vStakerFactory contract for creating and managing vStakers
 */
interface IVStakerFactory {
    /**
     * @notice Event emitted when a new vStaker contract is created.
     * @param stakerAddress Address of the new vStaker contract.
     * @param factory Address of the vStakerFactory contract.
     * @param lpToken Address of the liquidity pool token.
     */
    event StakerCreated(
        address stakerAddress,
        address factory,
        address lpToken
    );

    /**
     * @notice Event emitted when a new admin is pending approval.
     * @param newPendingAdmin Address of the new pending admin.
     */
    event StakerFactoryNewPendingAdmin(address newPendingAdmin);

    /**
     * @dev Event emitted when a new admin is approved.
     * @param newAdmin Address of the new admin.
     */
    event StakerFactoryNewAdmin(address newAdmin);

    /**
     * @notice Function to create a new staker contract for a given LP token
     * @param lpToken The address of the LP token
     * @return The address of the new staker contract
     */
    function createPoolStaker(address lpToken) external returns (address);

    /**
     * @dev Function to get the staker contract address for a given LP token
     * @param lpToken The address of the LP token
     * @return The address of the staker contract
     */
    function getPoolStaker(address lpToken) external view returns (address);

    function getAllStakers() external view returns (address[] memory);

    /**
     * @notice Function to get the staker contract address for VRSW-only staking
     * @return The address of the staker contract
     */
    function getVRSWPoolStaker() external view returns (address);

    /**
     * @notice Getter for admin.
     */
    function admin() external view returns (address);

    /**
     * @notice Getter for pendingAdmin.
     */
    function pendingAdmin() external view returns (address);

    /**
     * @notice Sets a new pending admin to be approved later.
     * @param newAdmin Address of the new pending admin.
     */
    function setPendingAdmin(address newAdmin) external;

    /**
     * @notice Approves the pending admin.
     */
    function acceptAdmin() external;
}
