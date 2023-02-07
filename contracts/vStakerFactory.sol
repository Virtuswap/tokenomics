// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import './vStaker.sol';
import './interfaces/IvStaker.sol';
import './interfaces/IvStakerFactory.sol';
import './types.sol';

contract vStakerFactory is IvStakerFactory {
    mapping(address => address) public stakers;
    address[] public allStakers;

    address public override admin;
    address public override pendingAdmin;

    address public immutable vrswToken;
    address public immutable gVrswToken;

    modifier onlyAdmin() {
        require(msg.sender == admin, 'OA');
        _;
    }

    constructor(address _vrswToken, address _gVrswToken) {
        admin = msg.sender;
        vrswToken = _vrswToken;
        gVrswToken = _gVrswToken;
    }

    function getPoolStaker(
        address _lpToken
    ) external view override returns (address) {
        return stakers[_lpToken];
    }

    function createPoolStaker(
        address _lpToken
    ) external override returns (address staker) {
        require(_lpToken != address(0), 'zero address');
        require(stakers[_lpToken] == address(0), 'staker exists');

        staker = address(new vStaker(_lpToken, vrswToken, gVrswToken));
        stakers[_lpToken] = staker;
        allStakers.push(staker);
    }

    function setPendingAdmin(
        address newPendingAdmin
    ) external override onlyAdmin {
        pendingAdmin = newPendingAdmin;
    }

    function acceptAdmin() external override {
        require(
            msg.sender != address(0) && msg.sender == pendingAdmin,
            'Only for pending admin'
        );
        admin = pendingAdmin;
        pendingAdmin = address(0);
    }
}
