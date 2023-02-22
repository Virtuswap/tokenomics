// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '../types.sol';

interface IvStaker {
    function lpToken() external view returns (address);

    function stakeVrsw(uint256 amount) external;

    function stakeLp(uint256 amount) external;

    function claimRewards() external;

    function viewRewards() external view returns (uint256 rewards);

    function viewStakes() external view returns (Stake[] memory rewards);

    function unstakeLp(uint256 amount) external;

    function lockVrsw(uint256 amount, uint256 lockDuration) external;

    function lockStakedVrsw(uint256 amount, uint256 lockDuration) external;

    function unstakeVrsw(uint256 amount) external;

    function checkLock(address who) external returns (bool isUnlocked);

    function withdrawUnlockedVrsw(address who) external;

    function setAllocationPoints() external;
}
