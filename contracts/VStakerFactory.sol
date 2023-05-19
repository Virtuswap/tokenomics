// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "./VStaker.sol";
import "./interfaces/IVStakerFactory.sol";

contract VStakerFactory is IVStakerFactory {
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
        require(msg.sender == admin, "OA");
        _;
    }

    constructor(
        address _vrswToken,
        address _minter,
        address _tokenomicsParams
    ) {
        require(_minter != address(0), "minter zero address");
        require(_vrswToken != address(0), "vrswToken zero address");
        require(
            _tokenomicsParams != address(0),
            "tokenomicsParams zero address"
        );
        admin = msg.sender;
        vrswToken = _vrswToken;
        minter = _minter;
        tokenomicsParams = _tokenomicsParams;
        // create staker for VRSW staking (without lp tokens)
        address staker = address(
            new VStaker(address(0), vrswToken, minter, tokenomicsParams)
        );
        stakers[address(0)] = staker;
        allStakers.push(staker);
    }

    /// @inheritdoc IVStakerFactory
    function createPoolStaker(
        address _lpToken
    ) external override onlyAdmin returns (address staker) {
        require(_lpToken != address(0), "zero address");
        require(stakers[_lpToken] == address(0), "staker exists");

        staker = address(
            new VStaker(_lpToken, vrswToken, minter, tokenomicsParams)
        );
        stakers[_lpToken] = staker;
        allStakers.push(staker);

        emit StakerCreated(staker, address(this), _lpToken);
    }

    /// @inheritdoc IVStakerFactory
    function setPendingAdmin(
        address newPendingAdmin
    ) external override onlyAdmin {
        pendingAdmin = newPendingAdmin;
        emit StakerFactoryNewPendingAdmin(newPendingAdmin);
    }

    /// @inheritdoc IVStakerFactory
    function acceptAdmin() external override {
        require(
            msg.sender != address(0) && msg.sender == pendingAdmin,
            "Only for pending admin"
        );
        admin = pendingAdmin;
        pendingAdmin = address(0);
        emit StakerFactoryNewAdmin(admin);
    }

    /// @inheritdoc IVStakerFactory
    function getVRSWPoolStaker() external view override returns (address) {
        return stakers[address(0)];
    }

    /// @inheritdoc IVStakerFactory
    function getPoolStaker(
        address _lpToken
    ) external view override returns (address) {
        return stakers[_lpToken];
    }

    /// @inheritdoc IVStakerFactory
    function getAllStakers() external view override returns (address[] memory) {
        return allStakers;
    }
}
