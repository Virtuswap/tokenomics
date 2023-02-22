// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {SD59x18, sd, unwrap, exp, UNIT, ZERO} from '@prb/math/src/SD59x18.sol';

library EmissionMath {
    SD59x18 public constant V = SD59x18.wrap(2.07738597911e18);
    SD59x18 public constant v = SD59x18.wrap(-5.821387457e9);
    SD59x18 public constant r = SD59x18.wrap(3e9);
    uint128 public constant TOTAL_ALGO_EMISSION = 300000000;
    uint128 public constant TOTAL_COMPOUND = 434006462;
    uint128 public constant TEN_YEARS = 315532800;

    function calculateAlgorithmicEmission(
        uint256 _t0,
        uint256 _t1
    ) internal pure returns (uint128 amount) {
        amount = (
            _t0 >= _t1
                ? 0
                : (
                    _t1 >= TEN_YEARS
                        ? TOTAL_ALGO_EMISSION
                        : _calculateEmission(_t1, ZERO)
                ) -
                    (
                        _t0 >= TEN_YEARS
                            ? TOTAL_ALGO_EMISSION
                            : _calculateEmission(_t0, ZERO)
                    )
        );
    }

    function calculateCompoundRate(
        uint256 _t0,
        uint256 _t1
    ) internal pure returns (uint128 amount) {
        amount = (
            _t0 >= _t1
                ? 0
                : (
                    _t1 >= TEN_YEARS
                        ? TOTAL_COMPOUND
                        : _calculateEmission(_t1, r)
                ) -
                    (
                        _t0 >= TEN_YEARS
                            ? TOTAL_ALGO_EMISSION
                            : _calculateEmission(_t0, r)
                    )
        );
    }

    function _calculateEmission(
        uint256 _t,
        SD59x18 _r
    ) private pure returns (uint128 amount) {
        amount = uint128(
            uint256(
                unwrap(
                    V
                        .mul(
                            exp(_r.add(v).mul(sd(int256(_t) * 1e18))).sub(UNIT)
                        )
                        .div(_r.add(v))
                )
            )
        );
    }
}
