// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {SD59x18, sd, unwrap, exp, UNIT, ZERO} from '@prb/math/src/SD59x18.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import './interfaces/IvTokenomicsParams.sol';

contract vTokenomicsParams is IvTokenomicsParams, Ownable {
    // Ten years in seconds starting from 2023
    uint256 public constant TEN_YEARS = (365 * 8 + 366 * 2) * 24 * 60 * 60;

    // parameters used in formula (3) in Virtuswap Tokenomics Whitepaper
    SD59x18 public override r;
    SD59x18 public override b;
    SD59x18 public override alpha;
    SD59x18 public override beta;
    SD59x18 public override gamma;

    /**
     * @dev Initializes the contract with default values for the tokenomics parameters.
     */
    constructor() {
        r = SD59x18.wrap((0.693 * 1e18) / int256(TEN_YEARS));
        b = SD59x18.wrap(1e18 / int256(TEN_YEARS));
        alpha = UNIT;
        gamma = UNIT;
        beta = SD59x18.wrap(0.5e18);
    }

    /// @inheritdoc IvTokenomicsParams
    function updateParams(
        SD59x18 _r,
        SD59x18 _b,
        SD59x18 _alpha,
        SD59x18 _beta,
        SD59x18 _gamma
    ) external override onlyOwner {
        r = _r;
        b = _b;
        alpha = _alpha;
        beta = _beta;
        gamma = _gamma;
        emit UpdateTokenomicsParams(_r, _b, _alpha, _beta, _gamma);
    }
}
