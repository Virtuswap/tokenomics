// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IvMinter {
    function newVesting(
        address beneficiary,
        uint256 startTs,
        uint256 duration,
        uint256 amount
    ) external returns (address vestingWallet);

    function setAllocationPoints(
        address[] calldata stakers,
        uint256[] calldata allocationPoints
    ) external;

    function setStakerFactory(address _newStakerFactory) external;

    function arbitraryTransfer(address to, uint256 amount) external;

    function emissionStartTs() external view returns (uint256);

    function transferRewards(address to, uint256 amount) external;

    function mintGVrsw(address to, uint256 amount) external;

    function burnGVrsw(address to, uint256 amount) external;

    function calculateTokensForStaker(
        address staker
    ) external view returns (uint256);

    function calculateCompoundRateForStaker(
        address staker
    ) external view returns (uint256);
}
