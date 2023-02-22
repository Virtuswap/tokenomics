// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

contract vVestingWallet {
    event ERC20Released(address indexed token, uint256 amount);

    uint256 private _erc20Released;
    address private immutable _beneficiary;
    address private immutable _erc20Token;
    uint64 private immutable _start;
    uint64 private immutable _duration;

    constructor(
        address beneficiaryAddress,
        address erc20Token,
        uint64 startTimestamp,
        uint64 durationSeconds
    ) payable {
        require(
            beneficiaryAddress != address(0),
            'vVestingWallet: beneficiary is zero address'
        );
        _erc20Token = erc20Token;
        _beneficiary = beneficiaryAddress;
        _start = startTimestamp;
        _duration = durationSeconds;
    }

    function beneficiary() public view returns (address) {
        return _beneficiary;
    }

    function start() public view returns (uint256) {
        return _start;
    }

    function duration() public view returns (uint256) {
        return _duration;
    }

    function released() public view returns (uint256) {
        return _erc20Released;
    }

    function releasable() public view returns (uint256) {
        return vestedAmount(uint64(block.timestamp)) - released();
    }

    function release() public {
        uint256 amount = releasable();
        _erc20Released += amount;
        emit ERC20Released(_erc20Token, amount);
        SafeERC20.safeTransfer(IERC20(_erc20Token), beneficiary(), amount);
    }

    function vestedAmount(uint64 timestamp) public view returns (uint256) {
        return
            _vestingSchedule(
                IERC20(_erc20Token).balanceOf(address(this)) + released(),
                timestamp
            );
    }

    function _vestingSchedule(
        uint256 totalAllocation,
        uint64 timestamp
    ) internal view returns (uint256) {
        if (timestamp < start()) {
            return 0;
        } else if (timestamp > start() + duration()) {
            return totalAllocation;
        } else {
            return (totalAllocation * (timestamp - start())) / duration();
        }
    }
}
