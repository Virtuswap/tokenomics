// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IvStakerFactory {
    event StakerCreated(address stakerAddress, address factory, address lpToken);
    event StakerFactoryNewPendingAdmin(address newPendingAdmin);
    event StakerFactoryNewAdmin(address newAdmin);

    function stakers(address staker) external returns (address);

    function createPoolStaker(address lpToken) external returns (address);

    function getPoolStaker(address lpToken) external view returns (address);

    function admin() external view returns (address);

    function pendingAdmin() external view returns (address);

    function setPendingAdmin(address newAdmin) external;

    function acceptAdmin() external;
}
