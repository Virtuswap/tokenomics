// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import './vStaker.sol';
import './interfaces/IvStaker.sol';
import './interfaces/IvStakerFactory.sol';
import './types.sol';

contract vStakerFactory is IvStakerFactory {
    // mapping of lp tokens to the corresponding staker
    mapping(address => address) public stakers;

    // list of all created stakers
    address[] public allStakers;

    // staker factory admin
    address public override admin;

    // staker factory pending admin
    address public override pendingAdmin;

    // VRSW token address
    address public immutable vrswToken;

    // chain minter address
    address public immutable minter;

    // tokenomics params address
    address public immutable tokenomicsParams;

    modifier onlyAdmin() {
        require(msg.sender == admin, 'OA');
        _;
    }

    constructor(
        address _vrswToken,
        address _minter,
        address _tokenomicsParams
    ) {
        admin = msg.sender;
        vrswToken = _vrswToken;
        minter = _minter;
        tokenomicsParams = _tokenomicsParams;
        // create staker for VRSW staking (without lp tokens)
        address staker = address(
            new vStaker(address(0), vrswToken, minter, tokenomicsParams)
        );
        stakers[address(0)] = staker;
        allStakers.push(staker);
    }

    /// @inheritdoc IvStakerFactory
    function getVRSWPoolStaker() external view override returns (address) {
        return stakers[address(0)];
    }

    /// @inheritdoc IvStakerFactory
    function getPoolStaker(
        address _lpToken
    ) external view override returns (address) {
        return stakers[_lpToken];
    }

    /// @inheritdoc IvStakerFactory
    function createPoolStaker(
        address _lpToken
    ) external override returns (address staker) {
        // TODO: onlyOwner
        require(_lpToken != address(0), 'zero address');
        require(stakers[_lpToken] == address(0), 'staker exists');

        staker = address(
            new vStaker(_lpToken, vrswToken, minter, tokenomicsParams)
        );
        stakers[_lpToken] = staker;
        allStakers.push(staker);

        emit StakerCreated(staker, address(this), _lpToken);
    }

    /// @inheritdoc IvStakerFactory
    function setPendingAdmin(
        address newPendingAdmin
    ) external override onlyAdmin {
        pendingAdmin = newPendingAdmin;
        emit StakerFactoryNewPendingAdmin(newPendingAdmin);
    }

    /// @inheritdoc IvStakerFactory
    function acceptAdmin() external override {
        require(
            msg.sender != address(0) && msg.sender == pendingAdmin,
            'Only for pending admin'
        );
        admin = pendingAdmin;
        pendingAdmin = address(0);
        emit StakerFactoryNewAdmin(admin);
    }
}
