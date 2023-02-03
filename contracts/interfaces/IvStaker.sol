// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '../types.sol';

interface IvStaker {
    function stakeVrsw(uint256 amount, uint256 lockDuration) external;

    function stakeLp(uint256 amount) external;

    function claimRewards() external;

    function viewRewards() external view returns (uint256 rewards);

    function viewStakes() external view returns (Stake[] memory rewards);

    function unstakeLp(uint256 amount) external;

    function unstakeVrsw(address who) external;

    function lockVrsw(uint256 amount, uint256 lockDuration) external;

    function setAllocationPoints(uint256 newAllocationPoints) external;
}
